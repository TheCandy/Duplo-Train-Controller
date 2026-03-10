import { Theme, Flex, Text, Button, ThemePanel } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';
import { useEffect, useState } from 'react';


const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const HUB_ATTACHED_IO_MESSAGE_TYPE = 0x04;
const GENERIC_ERROR_MESSAGE_TYPE = 0x05;
const PORT_INFORMATION_MESSAGE_TYPE = 0x43;
const PORT_MODE_INFORMATION_MESSAGE_TYPE = 0x44;
const SYSTEM_TRAIN_MOTOR_IO_TYPE = 0x0002;
const MOTOR_IO_TYPE = 0x0001;
const EXTERNAL_MOTOR_WITH_TACHO_IO_TYPE = 0x0026;
const INTERNAL_MOTOR_WITH_TACHO_IO_TYPE = 0x0027;
const DEFAULT_MOTOR_PORT_ID = 0x00;
const MEDIUM_POWER = 50;
const MAX_POWER = 100;

const PORT_INFORMATION_MODE_INFO = 0x01;
const PORT_MODE_INFO_NAME = 0x00;

type AttachedPort = {
  portId: number;
  ioTypeId: number;
};

type PortDetails = AttachedPort & {
  inputModes?: number;
  outputModes?: number;
  totalModes?: number;
  mode0Name?: string;
};

const toHexString = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

const getIoTypeName = (ioTypeId: number) => {
  const ioTypeNames: Record<number, string> = {
    [MOTOR_IO_TYPE]: 'Motor',
    [SYSTEM_TRAIN_MOTOR_IO_TYPE]: 'System Train Motor',
    0x0005: 'Button',
    0x0008: 'LED Light',
    0x0014: 'Voltage',
    0x0015: 'Current',
    0x0016: 'Piezo Tone',
    0x0017: 'RGB Light',
    0x0022: 'External Tilt Sensor',
    0x0023: 'Motion Sensor',
    0x0025: 'Vision Sensor',
    [EXTERNAL_MOTOR_WITH_TACHO_IO_TYPE]: 'External Motor With Tacho',
    [INTERNAL_MOTOR_WITH_TACHO_IO_TYPE]: 'Internal Motor With Tacho',
    0x0028: 'Internal Tilt',
  };

  const knownName = ioTypeNames[ioTypeId];
  if (knownName) {
    return knownName;
  }

  return `Unknown 0x${ioTypeId.toString(16).padStart(4, '0')}`;
};

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x10, 0x51, 0x00, power]);
};

const buildMotorSpeedCommand = (portId: number, speed: number, maxPower: number) => {
  return new Uint8Array([0x09, 0x00, 0x81, portId, 0x10, 0x07, speed, maxPower, 0x00]);
};

const buildPortInformationRequest = (portId: number) => {
  return new Uint8Array([0x05, 0x00, 0x21, portId, PORT_INFORMATION_MODE_INFO]);
};

const buildPortModeNameRequest = (portId: number, mode: number) => {
  return new Uint8Array([0x06, 0x00, 0x22, portId, mode, PORT_MODE_INFO_NAME]);
};

const getHubMessageDescription = (bytes: Uint8Array) => {
  if (bytes.length < 3) {
    return 'Short or malformed hub message';
  }

  if (bytes[2] === GENERIC_ERROR_MESSAGE_TYPE && bytes.length >= 5) {
    const errorDescriptions: Record<number, string> = {
      0x01: 'ACK',
      0x02: 'MACK',
      0x03: 'Buffer overflow',
      0x04: 'Timeout',
      0x05: 'Command not recognized',
      0x06: 'Invalid use or parameter error',
      0x07: 'Overcurrent',
      0x08: 'Internal error'
    };

    const commandType = bytes[3];
    const errorCode = bytes[4];
    const errorLabel = errorDescriptions[errorCode] ?? `Unknown error 0x${errorCode.toString(16).padStart(2, '0')}`;
    return `Hub error for command 0x${commandType.toString(16).padStart(2, '0')}: ${errorLabel}`;
  }

  if (bytes[2] === HUB_ATTACHED_IO_MESSAGE_TYPE && bytes.length >= 7) {
    const portId = bytes[3];
    const ioTypeId = bytes[5] | (bytes[6] << 8);
    return `Attached I/O on port ${portId}: ${getIoTypeName(ioTypeId)}`;
  }

  if (bytes[2] === PORT_INFORMATION_MESSAGE_TYPE && bytes.length >= 11) {
    const portId = bytes[3];
    const outputModes = bytes[9] | (bytes[10] << 8);
    return `Port ${portId} capabilities received${outputModes ? ' (output capable)' : ''}`;
  }

  if (bytes[2] === PORT_MODE_INFORMATION_MESSAGE_TYPE && bytes.length >= 7 && bytes[5] === PORT_MODE_INFO_NAME) {
    const portId = bytes[3];
    const name = new TextDecoder().decode(bytes.slice(6));
    return `Port ${portId} mode 0 name: ${name}`;
  }

  return `Hub message type 0x${bytes[2].toString(16).padStart(2, '0')}`;
};

const isMotorLikeIoType = (ioTypeId: number) => {
  return [
    MOTOR_IO_TYPE,
    SYSTEM_TRAIN_MOTOR_IO_TYPE,
    EXTERNAL_MOTOR_WITH_TACHO_IO_TYPE,
    INTERNAL_MOTOR_WITH_TACHO_IO_TYPE
  ].includes(ioTypeId);
};


function App() {
  const {
    device,
    isSupported,
    isConnecting,
    error,
    requestDevice,
    connect,
    disconnect,
    writeCharacteristic,
    startNotifications
  } = useBluetooth();


  const [attachedPorts, setAttachedPorts] = useState<AttachedPort[]>([]);
  const [lastNotification, setLastNotification] = useState('');
  const [lastHubMessage, setLastHubMessage] = useState('');
  const [portDetails, setPortDetails] = useState<Record<number, PortDetails>>({});

  const motorPort =
    Object.values(portDetails).find((port) => port.ioTypeId === SYSTEM_TRAIN_MOTOR_IO_TYPE) ??
    Object.values(portDetails).find((port) => isMotorLikeIoType(port.ioTypeId)) ??
    Object.values(portDetails).find((port) => (port.outputModes ?? 0) > 0) ??
    null;

  const motorPortId = motorPort?.portId ?? DEFAULT_MOTOR_PORT_ID;

  const connectToDevice = async () => {
    await requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
  };


  const handleConnect = async () => {
    const success = await connect();
    if (success) {
      console.log('Connected successfully');
    }
  };

  useEffect(() => {
    if (!device?.connected) {
      setAttachedPorts([]);
      setLastNotification('');
      setLastHubMessage('');
      setPortDetails({});
      return;
    }

    let isActive = true;

    const enableNotifications = async () => {
      await startNotifications(SERVICE_UUID, CHARACTERISTIC_UUID, (value) => {
        if (!isActive) {
          return;
        }

        const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        setLastNotification(toHexString(bytes));
        setLastHubMessage(getHubMessageDescription(bytes));

        if (bytes[2] === PORT_INFORMATION_MESSAGE_TYPE && bytes.length >= 11) {
          const portId = bytes[3];
          const inputModes = bytes[7] | (bytes[8] << 8);
          const outputModes = bytes[9] | (bytes[10] << 8);
          const totalModes = bytes[6];

          setPortDetails((current) => ({
            ...current,
            [portId]: {
              ...(current[portId] ?? { portId, ioTypeId: 0xffff }),
              portId,
              inputModes,
              outputModes,
              totalModes,
            }
          }));
          return;
        }

        if (bytes[2] === PORT_MODE_INFORMATION_MESSAGE_TYPE && bytes.length >= 7 && bytes[5] === PORT_MODE_INFO_NAME) {
          const portId = bytes[3];
          const mode0Name = new TextDecoder().decode(bytes.slice(6));

          setPortDetails((current) => ({
            ...current,
            [portId]: {
              ...(current[portId] ?? { portId, ioTypeId: 0xffff }),
              portId,
              mode0Name,
            }
          }));
          return;
        }

        if (bytes.length < 7 || bytes[2] !== HUB_ATTACHED_IO_MESSAGE_TYPE || bytes[4] !== 0x01) {
          return;
        }

        const portId = bytes[3];
        const ioTypeId = bytes[5] | (bytes[6] << 8);

        setAttachedPorts((current) => {
          const nextPort = { portId, ioTypeId };
          const withoutExisting = current.filter((port) => port.portId !== portId);
          return [...withoutExisting, nextPort].sort((left, right) => left.portId - right.portId);
        });

        setPortDetails((current) => ({
          ...current,
          [portId]: {
            ...(current[portId] ?? {}),
            portId,
            ioTypeId,
          }
        }));

        void writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, buildPortInformationRequest(portId));
        void writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, buildPortModeNameRequest(portId, 0));
      });
    };

    void enableNotifications();

    return () => {
      isActive = false;
    };
  }, [device?.connected, startNotifications, writeCharacteristic]);

  const runTrainAtMediumSpeed = async () => {
    const message = motorPort && isMotorLikeIoType(motorPort.ioTypeId)
      ? buildMotorSpeedCommand(motorPortId, MEDIUM_POWER, MAX_POWER)
      : buildDuploMotorPowerCommand(motorPortId, MEDIUM_POWER);

    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, message);
    if (success) {
      console.log(`Train running on port ${motorPortId}`);
    }
  };

  const stopTrain = async () => {
    const message = buildDuploMotorPowerCommand(motorPortId, 0);
    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, message);
    if (success) {
      console.log(`Train stopped on port ${motorPortId}`);
    }
  };

  if (!isSupported) {
    return <div>Web Bluetooth not supported</div>;
  }

  return (
    <Theme>
      <Flex direction="column" gap="2">
        <Text>Duplo train</Text>
        <Button onClick={connectToDevice} disabled={isConnecting}>
          Select Device
        </Button>

        {device && (
          <div>
            <p>Device: {device.name || 'Unknown'}</p>
            <p>Status: {device.connected ? 'Connected' : 'Disconnected'}</p>

            {!device.connected ? (
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            ) : (
              <>
                <p>Motor Port: {motorPortId}</p>
                <p>Motor Type: {motorPort ? getIoTypeName(motorPort.ioTypeId) : 'Not identified yet'}</p>
                <Button onClick={runTrainAtMediumSpeed}>Run Train At Medium Speed</Button>
                <Button onClick={stopTrain}>Stop Train</Button>
                <p>Hub messages arrive through notifications on this characteristic.</p>

                {attachedPorts.length > 0 && (
                  <div>
                    <p>Attached I/O</p>
                    <ul>
                      {attachedPorts.map((port) => (
                        <li key={port.portId}>
                          Port {port.portId}: {getIoTypeName(port.ioTypeId)}
                          {portDetails[port.portId]?.mode0Name ? ` (${portDetails[port.portId].mode0Name})` : ''}
                          {(portDetails[port.portId]?.outputModes ?? 0) > 0 ? ' [output]' : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {lastHubMessage && <p>Last Hub Message: {lastHubMessage}</p>}
                {lastNotification && <p>Last Notification: {lastNotification}</p>}
                <Button onClick={disconnect}>Disconnect</Button>
              </>
            )}
          </div>
        )}

        {error && <p>Error: {error}</p>}
      </Flex>
      <ThemePanel />
    </Theme>
  );
}

export default App
