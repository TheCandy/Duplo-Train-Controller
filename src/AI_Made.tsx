import { Flex, Text, Button } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';
import { useEffect, useRef, useState } from 'react';


const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const HUB_ATTACHED_IO_MESSAGE_TYPE = 0x04;
const GENERIC_ERROR_MESSAGE_TYPE = 0x05;
const PORT_OUTPUT_COMMAND_FEEDBACK_MESSAGE_TYPE = 0x82;
const PORT_INFORMATION_MESSAGE_TYPE = 0x43;
const PORT_MODE_INFORMATION_MESSAGE_TYPE = 0x44;
const SYSTEM_TRAIN_MOTOR_IO_TYPE = 0x0002;
const MOTOR_IO_TYPE = 0x0001;
const EXTERNAL_MOTOR_WITH_TACHO_IO_TYPE = 0x0026;
const INTERNAL_MOTOR_WITH_TACHO_IO_TYPE = 0x0027;
const DUPLO_TRAIN_BASE_MOTOR_IO_TYPE = 0x0029;
const DUPLO_TRAIN_BASE_SPEAKER_IO_TYPE = 0x002a;
const DUPLO_TRAIN_BASE_COLOR_SENSOR_IO_TYPE = 0x002b;
const DUPLO_TRAIN_BASE_SPEEDOMETER_IO_TYPE = 0x002c;
const DEFAULT_MOTOR_PORT_ID = 0x00;
const MEDIUM_POWER = 50;
const MAX_POWER = 100;

const PORT_INFORMATION_MODE_INFO = 0x01;
const PORT_MODE_INFO_NAME = 0x00;

type AttachedPort = {
  portId: number;
  ioTypeId: number;
  event: 0x01 | 0x02;
  virtualPortA?: number;
  virtualPortB?: number;
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
    [DUPLO_TRAIN_BASE_MOTOR_IO_TYPE]: 'Duplo Train Base Motor',
    [DUPLO_TRAIN_BASE_SPEAKER_IO_TYPE]: 'Duplo Train Base Speaker',
    [DUPLO_TRAIN_BASE_COLOR_SENSOR_IO_TYPE]: 'Duplo Train Base Color Sensor',
    [DUPLO_TRAIN_BASE_SPEEDOMETER_IO_TYPE]: 'Duplo Train Base Speedometer',
    0x0028: 'Internal Tilt',
  };

  const knownName = ioTypeNames[ioTypeId];
  if (knownName) {
    return knownName;
  }

  return `Unknown 0x${ioTypeId.toString(16).padStart(4, '0')}`;
};

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, power]);
};

const buildMotorSpeedCommand = (portId: number, speed: number, maxPower: number) => {
  return new Uint8Array([0x09, 0x00, 0x81, portId, 0x11, 0x07, speed, maxPower, 0x00]);
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
    const event = bytes[4];
    const ioTypeId = bytes[5] | (bytes[6] << 8);
    if (event === 0x02 && bytes.length >= 9) {
      return `Attached virtual I/O on port ${portId}: ${getIoTypeName(ioTypeId)} from ports ${bytes[7]} and ${bytes[8]}`;
    }

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

  if (bytes[2] === PORT_OUTPUT_COMMAND_FEEDBACK_MESSAGE_TYPE && bytes.length >= 5) {
    const portId = bytes[3];
    return `Port ${portId} output command feedback 0x${bytes[4].toString(16).padStart(2, '0')}`;
  }

  return `Hub message type 0x${bytes[2].toString(16).padStart(2, '0')}`;
};

const isMotorLikeIoType = (ioTypeId: number) => {
  return [
    MOTOR_IO_TYPE,
    SYSTEM_TRAIN_MOTOR_IO_TYPE,
    EXTERNAL_MOTOR_WITH_TACHO_IO_TYPE,
    INTERNAL_MOTOR_WITH_TACHO_IO_TYPE,
    DUPLO_TRAIN_BASE_MOTOR_IO_TYPE
  ].includes(ioTypeId);
};

const isLikelyMetadataMode = (mode0Name?: string) => {
  return ['TAG', 'VERS'].includes(mode0Name ?? '');
};


function AIMade() {
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
  const pendingOutputResultRef = useRef<{
    portId: number;
    resolve: (result: 'accepted' | 'rejected') => void;
  } | null>(null);

  const motorPort =
    Object.values(portDetails).find((port) => port.ioTypeId === DUPLO_TRAIN_BASE_MOTOR_IO_TYPE) ??
    Object.values(portDetails).find((port) => port.ioTypeId === SYSTEM_TRAIN_MOTOR_IO_TYPE) ??
    Object.values(portDetails).find((port) => attachedPorts.find((attachedPort) => attachedPort.portId === port.portId)?.event === 0x02) ??
    Object.values(portDetails).find((port) => isMotorLikeIoType(port.ioTypeId)) ??
    Object.values(portDetails).find((port) => (port.outputModes ?? 0) > 0 && !isLikelyMetadataMode(port.mode0Name)) ??
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

        if (bytes[2] === PORT_OUTPUT_COMMAND_FEEDBACK_MESSAGE_TYPE && bytes.length >= 5) {
          const portId = bytes[3];
          const pendingOutput = pendingOutputResultRef.current;

          if (pendingOutput && pendingOutput.portId === portId) {
            pendingOutput.resolve('accepted');
            pendingOutputResultRef.current = null;
          }

          return;
        }

        if (bytes[2] === GENERIC_ERROR_MESSAGE_TYPE && bytes.length >= 5 && bytes[3] === 0x81) {
          const pendingOutput = pendingOutputResultRef.current;

          if (pendingOutput) {
            pendingOutput.resolve('rejected');
            pendingOutputResultRef.current = null;
          }
        }

        if (bytes.length < 5 || bytes[2] !== HUB_ATTACHED_IO_MESSAGE_TYPE) {
          return;
        }

        const portId = bytes[3];
        const event = bytes[4];

        if (event === 0x00) {
          setAttachedPorts((current) => current.filter((port) => port.portId !== portId));
          setPortDetails((current) => {
            const next = { ...current };
            delete next[portId];
            return next;
          });
          return;
        }

        if (bytes.length < 7 || (event !== 0x01 && event !== 0x02)) {
          return;
        }

        const ioTypeId = bytes[5] | (bytes[6] << 8);
        const nextPort: AttachedPort = {
          portId,
          ioTypeId,
          event,
          ...(event === 0x02 && bytes.length >= 9
            ? { virtualPortA: bytes[7], virtualPortB: bytes[8] }
            : {})
        };

        setAttachedPorts((current) => {
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

  const tryRunCommandOnPort = async (port: PortDetails) => {
    const message = isMotorLikeIoType(port.ioTypeId)
      ? buildMotorSpeedCommand(port.portId, MEDIUM_POWER, MAX_POWER)
      : buildDuploMotorPowerCommand(port.portId, MEDIUM_POWER);

    const resultPromise = new Promise<'accepted' | 'rejected'>((resolve) => {
      pendingOutputResultRef.current = { portId: port.portId, resolve };
      window.setTimeout(() => {
        if (pendingOutputResultRef.current?.portId === port.portId) {
          pendingOutputResultRef.current.resolve('accepted');
          pendingOutputResultRef.current = null;
        }
      }, 400);
    });

    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, message);
    if (!success) {
      if (pendingOutputResultRef.current?.portId === port.portId) {
        pendingOutputResultRef.current = null;
      }
      return false;
    }

    return (await resultPromise) === 'accepted';
  };

  const runTrainAtMediumSpeed = async () => {
    const candidatePorts = [
      ...Object.values(portDetails).filter((port) => port.ioTypeId === DUPLO_TRAIN_BASE_MOTOR_IO_TYPE),
      ...Object.values(portDetails).filter((port) => attachedPorts.find((attachedPort) => attachedPort.portId === port.portId)?.event === 0x02),
      ...Object.values(portDetails).filter((port) => isMotorLikeIoType(port.ioTypeId)),
      ...Object.values(portDetails).filter((port) => (port.outputModes ?? 0) > 0 && !isLikelyMetadataMode(port.mode0Name)),
      ...Object.values(portDetails).filter((port) => (port.outputModes ?? 0) > 0),
    ].filter((port, index, current) => current.findIndex((candidate) => candidate.portId === port.portId) === index);

    for (const port of candidatePorts) {
      const accepted = await tryRunCommandOnPort(port);
      if (accepted) {
        console.log(`Train running on port ${port.portId}`);
        return;
      }
    }

    console.log(`No accepted output command found; last attempted port ${motorPortId}`);
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
                        {port.event === 0x02 && port.virtualPortA !== undefined && port.virtualPortB !== undefined
                          ? ` [virtual ${port.virtualPortA}+${port.virtualPortB}]`
                          : ''}
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
  );
}

export default AIMade
