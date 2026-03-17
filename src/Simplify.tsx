import { Theme, Flex, Text, Button } from "@radix-ui/themes";
import { useEffect, useState } from 'react';
import { useBluetooth } from './hooks/use-bluetooth';

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const HUB_ATTACHED_IO_MESSAGE_TYPE = 0x04;
const PORT_INPUT_FORMAT_SETUP_SINGLE_MESSAGE_TYPE = 0x41;
const PORT_VALUE_SINGLE_MESSAGE_TYPE = 0x45;
const DUPLO_TRAIN_BASE_MOTOR_IO_TYPE = 0x0029;
const DUPLO_TRAIN_BASE_SPEEDOMETER_IO_TYPE = 0x002c;
const DUPLO_TRAIN_BASE_COLOR_SENSOR_IO_TYPE = 0x002b;
const HUB_LED_IO_TYPE = 0x0017;

const COLOR_NAMES: Record<number, string> = {
  0: 'Black',
  1: 'Pink',
  2: 'Purple',
  3: 'Blue',
  4: 'Light Blue',
  5: 'Cyan',
  6: 'Green',
  7: 'Yellow',
  8: 'Orange',
  9: 'Red',
  10: 'White',
  255: 'None',
};

const COLOR_CSS: Record<number, string> = {
  0: '#000000',
  1: '#ff69b4',
  2: '#800080',
  3: '#0000ff',
  4: '#87ceeb',
  5: '#00ffff',
  6: '#00ff00',
  7: '#ffff00',
  8: '#ffa500',
  9: '#ff0000',
  10: '#ffffff',
  255: 'transparent',
};

const buildPortValueEnableCommand = (portId: number, mode: number = 0x00) => {
  return new Uint8Array([
    0x0a,
    0x00,
    PORT_INPUT_FORMAT_SETUP_SINGLE_MESSAGE_TYPE,
    portId,
    mode,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
  ]);
};

const buildLedColorCommand = (portId: number, colorIndex: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, colorIndex]);
};

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, power]);
};

const readPortValue = (bytes: Uint8Array) => {
  const value = new DataView(bytes.buffer, bytes.byteOffset + 4, bytes.byteLength - 4);

  if (value.byteLength === 1) {
    return value.getInt8(0);
  }

  if (value.byteLength === 2) {
    return value.getInt16(0, true);
  }

  if (value.byteLength >= 4) {
    return value.getInt32(0, true);
  }

  return 0;
};

function Simplify() {
  const {
    device,
    requestDevice,
    connect,
    writeCharacteristic,
    startNotifications,
    error,
  } = useBluetooth();
  const [motorPortId, setMotorPortId] = useState<number | null>(null);
  const [speedometerPortId, setSpeedometerPortId] = useState<number | null>(null);
  const [colorSensorPortId, setColorSensorPortId] = useState<number | null>(null);
  const [ledPortId, setLedPortId] = useState<number | null>(null);
  const [trainSpeed, setTrainSpeed] = useState<number | null>(null);
  const [detectedColor, setDetectedColor] = useState<number | null>(null);
  const [motorPower, setMotorPower] = useState('50');
  const [selectedLedColor, setSelectedLedColor] = useState<number>(9);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-49), msg]);
  };

  const connectToDevice = async () => {
    await requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
  };

  useEffect(() => {
    if (!device?.connected) {
      setMotorPortId(null);
      setSpeedometerPortId(null);
      setColorSensorPortId(null);
      setLedPortId(null);
      setTrainSpeed(null);
      setDetectedColor(null);
      return;
    }

    let isActive = true;

    const enableNotifications = async () => {
      await startNotifications(SERVICE_UUID, CHARACTERISTIC_UUID, (value) => {
        if (!isActive) {
          return;
        }

        const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        addLog(`RX [${hex}]`);
        if (bytes.length >= 5 && bytes[2] === PORT_VALUE_SINGLE_MESSAGE_TYPE) {
          if (speedometerPortId !== null && bytes[3] === speedometerPortId) {
            setTrainSpeed(readPortValue(bytes));
            return;
          }
          if (colorSensorPortId !== null && bytes[3] === colorSensorPortId) {
            setDetectedColor(bytes[4]);
            return;
          }
        }

        if (bytes.length < 7 || bytes[2] !== HUB_ATTACHED_IO_MESSAGE_TYPE) {
          return;
        }

        const event = bytes[4];
        const ioTypeId = bytes[5] | (bytes[6] << 8);
        addLog(`IO attach: port=${bytes[3]}, event=${event}, ioType=0x${ioTypeId.toString(16).padStart(4, '0')}`);

        if (event !== 0x01 && event !== 0x02) {
          return;
        }

        if (ioTypeId === DUPLO_TRAIN_BASE_MOTOR_IO_TYPE) {
          setMotorPortId(bytes[3]);
        }

        if (ioTypeId === DUPLO_TRAIN_BASE_SPEEDOMETER_IO_TYPE) {
          setSpeedometerPortId(bytes[3]);
          void writeCharacteristic(
            SERVICE_UUID,
            CHARACTERISTIC_UUID,
            buildPortValueEnableCommand(bytes[3])
          );
        }

        if (ioTypeId === DUPLO_TRAIN_BASE_COLOR_SENSOR_IO_TYPE) {
          setColorSensorPortId(bytes[3]);
          void writeCharacteristic(
            SERVICE_UUID,
            CHARACTERISTIC_UUID,
            buildPortValueEnableCommand(bytes[3], 0x01)
          );
        }

        if (ioTypeId === HUB_LED_IO_TYPE) {
          setLedPortId(bytes[3]);
        }
      });
    };

    void enableNotifications();

    return () => {
      isActive = false;
    };
  }, [device?.connected, speedometerPortId, colorSensorPortId, startNotifications, writeCharacteristic]);

  const sendMotorPower = async (power: number) => {
    if (motorPortId === null) {
      return;
    }

    const success = await writeCharacteristic(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      buildDuploMotorPowerCommand(motorPortId, power)
    );

    if (success) {
      addLog('Motor power written');
    }
  };

  const runTrainMotor = async () => {
    await sendMotorPower(Number(motorPower));
  };

  const stopTrain = async () => {
    await sendMotorPower(0);
  };

  const setLedColor = async (colorIndex: number) => {
    if (ledPortId === null) return;
    await writeCharacteristic(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      buildLedColorCommand(ledPortId, colorIndex)
    );
  };

  return (
    <Theme>
      <Flex direction="column" gap="2">
        <Text>Duplo train</Text>
        <div>
          <Button onClick={connectToDevice}>Select Device</Button>

          {device && !device.connected && (
            <Button onClick={connect}>Connect</Button>
          )}

          {device?.connected && (
            <div>
              <p>Motor port: {motorPortId ?? 'detecting...'}</p>
              <p>Speedometer port: {speedometerPortId ?? 'detecting...'}</p>
              <p>Color sensor port: {colorSensorPortId ?? 'detecting...'}</p>
              <p>LED port: {ledPortId ?? 'detecting...'}</p>
              <p>Train speed: {trainSpeed ?? 'waiting...'}</p>
              <p>
                Detected color:{' '}
                {detectedColor !== null ? (
                  <span style={{
                    backgroundColor: COLOR_CSS[detectedColor] ?? '#888',
                    color: detectedColor === 0 || detectedColor === 2 || detectedColor === 3 ? '#fff' : '#000',
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                  }}>
                    {COLOR_NAMES[detectedColor] ?? `Unknown (${detectedColor})`}
                  </span>
                ) : 'waiting...'}
              </p>
              <input
                type="number"
                value={motorPower}
                onChange={(event) => setMotorPower(event.target.value)}
              />
              <Button onClick={runTrainMotor} disabled={motorPortId === null}>Send power to motor</Button>
              <Button onClick={stopTrain} disabled={motorPortId === null}>Stop train</Button>
              <div style={{ marginTop: 12 }}>
                <p>Set LED color:</p>
                <select
                  value={selectedLedColor}
                  onChange={(e) => setSelectedLedColor(Number(e.target.value))}
                >
                  {Object.entries(COLOR_NAMES)
                    .filter(([key]) => Number(key) !== 255)
                    .map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                </select>
                <Button onClick={() => setLedColor(selectedLedColor)} disabled={ledPortId === null}>Set LED</Button>
                <Button onClick={() => setLedColor(255)} disabled={ledPortId === null}>LED Off</Button>
              </div>
            </div>
          )}

          {error && <p>Error: {error}</p>}
        </div>
        <div style={{ marginTop: 16, padding: 8, background: '#1a1a2e', color: '#0f0', fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflowY: 'auto', borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <strong>Debug Log ({logs.length})</strong>
            <button onClick={() => setLogs([])} style={{ fontSize: 10, background: '#333', color: '#fff', border: 'none', borderRadius: 3, padding: '2px 6px' }}>Clear</button>
          </div>
          {logs.length === 0 && <div style={{ color: '#666' }}>No messages yet...</div>}
          {logs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      </Flex>
    </Theme>
  );
}

export default Simplify
