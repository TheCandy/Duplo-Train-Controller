import { Theme, Flex, Text, Button, ThemePanel } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';
import { useEffect, useState } from 'react';


const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const HUB_ATTACHED_IO_MESSAGE_TYPE = 0x04;
const SYSTEM_TRAIN_MOTOR_IO_TYPE = 0x0002;
const DEFAULT_MOTOR_PORT_ID = 0x00;
const MEDIUM_POWER = 50;

type AttachedPort = {
  portId: number;
  ioTypeId: number;
};

const toHexString = (value: Uint8Array) =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

const getIoTypeName = (ioTypeId: number) => {
  if (ioTypeId === SYSTEM_TRAIN_MOTOR_IO_TYPE) {
    return 'System Train Motor';
  }

  return `Unknown 0x${ioTypeId.toString(16).padStart(4, '0')}`;
};

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x10, 0x51, 0x00, power]);
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
    readCharacteristic,
    writeCharacteristic,
    startNotifications
  } = useBluetooth();


  const [data, setData] = useState<string>('');
  const [attachedPorts, setAttachedPorts] = useState<AttachedPort[]>([]);
  const [lastNotification, setLastNotification] = useState('');

  const motorPortId =
    attachedPorts.find((port) => port.ioTypeId === SYSTEM_TRAIN_MOTOR_IO_TYPE)?.portId ??
    DEFAULT_MOTOR_PORT_ID;

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
      });
    };

    void enableNotifications();

    return () => {
      isActive = false;
    };
  }, [device?.connected, startNotifications]);

  const readData = async () => {
    const value = await readCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID);
    if (value) {
      const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      setData(toHexString(bytes));
    }
  };

  const runTrainAtMediumSpeed = async () => {
    const message = buildDuploMotorPowerCommand(motorPortId, MEDIUM_POWER);
    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, message);
    if (success) {
      console.log(`Train running on port ${motorPortId} with power ${MEDIUM_POWER}`);
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
                <Button onClick={runTrainAtMediumSpeed}>Run Train At Medium Speed</Button>
                <Button onClick={stopTrain}>Stop Train</Button>
                <Button onClick={readData}>Read Data</Button>
                <p>Read Value: {data}</p>

                {attachedPorts.length > 0 && (
                  <div>
                    <p>Attached I/O</p>
                    <ul>
                      {attachedPorts.map((port) => (
                        <li key={port.portId}>
                          Port {port.portId}: {getIoTypeName(port.ioTypeId)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

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
