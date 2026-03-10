import { Theme, Flex, Text, Button } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const MEDIUM_POWER = 50;
const MAX_POWER = 100;
const DUPLO_TRAIN_BASE_MOTOR_IO_TYPE = 0x0029;

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, power]);
};

const buildMotorSpeedCommand = (portId: number, speed: number, maxPower: number) => {
  return new Uint8Array([0x09, 0x00, 0x81, portId, 0x11, 0x07, speed, maxPower, 0x00]);
};

function Simplify() {
  const {
    device,
    requestDevice,
    connect,
    writeCharacteristic
  } = useBluetooth();

  const connectToDevice = async () => {
    await requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
  };

  const runTrainDuploCommand = async () => {
    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, buildDuploMotorPowerCommand(DUPLO_TRAIN_BASE_MOTOR_IO_TYPE, MEDIUM_POWER));
    if (success) {
      console.log('Data written successfully');
    }
  };


  const runTrainMotorSpeedCommand = async () => {
    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, buildMotorSpeedCommand(DUPLO_TRAIN_BASE_MOTOR_IO_TYPE, MEDIUM_POWER, MAX_POWER));
    if (success) {
      console.log('Data written successfully');
    }
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
              <Button onClick={runTrainDuploCommand}>Run train duplo command</Button>
              <Button onClick={runTrainMotorSpeedCommand}>Run train motor speed command</Button>
            </div>
          )}
        </div>
      </Flex>
    </Theme>
  );
}

export default Simplify
