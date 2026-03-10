import { Theme, Flex, Text, Button } from "@radix-ui/themes";
import { useEffect, useState } from 'react';
import { useBluetooth } from './hooks/use-bluetooth';

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const HUB_ATTACHED_IO_MESSAGE_TYPE = 0x04;
const DUPLO_TRAIN_BASE_MOTOR_IO_TYPE = 0x0029;

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, power]);
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
  const [motorPower, setMotorPower] = useState('50');

  const connectToDevice = async () => {
    await requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
  };

  useEffect(() => {
    if (!device?.connected) {
      setMotorPortId(null);
      return;
    }

    let isActive = true;

    const enableNotifications = async () => {
      await startNotifications(SERVICE_UUID, CHARACTERISTIC_UUID, (value) => {
        if (!isActive) {
          return;
        }

        const bytes = new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        if (bytes.length < 7 || bytes[2] !== HUB_ATTACHED_IO_MESSAGE_TYPE) {
          return;
        }

        const event = bytes[4];
        const ioTypeId = bytes[5] | (bytes[6] << 8);

        if (event !== 0x01 && event !== 0x02) {
          return;
        }

        if (ioTypeId === DUPLO_TRAIN_BASE_MOTOR_IO_TYPE) {
          setMotorPortId(bytes[3]);
        }
      });
    };

    void enableNotifications();

    return () => {
      isActive = false;
    };
  }, [device?.connected, startNotifications]);

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
      console.log('Data written successfully');
    }
  };

  const runTrainMotor = async () => {
    await sendMotorPower(Number(motorPower));
  };

  const stopTrain = async () => {
    await sendMotorPower(0);
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
              <input
                type="number"
                value={motorPower}
                onChange={(event) => setMotorPower(event.target.value)}
              />
              <Button onClick={runTrainMotor} disabled={motorPortId === null}>Send power to motor</Button>
              <Button onClick={stopTrain} disabled={motorPortId === null}>Stop train</Button>
            </div>
          )}

          {error && <p>Error: {error}</p>}
        </div>
      </Flex>
    </Theme>
  );
}

export default Simplify
