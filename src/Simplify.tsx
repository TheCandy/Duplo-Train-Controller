import { Theme, Flex, Text, Button } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';

const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';
const DEFAULT_MOTOR_PORT_ID = 0x00;
const MEDIUM_POWER = 50;

const buildDuploMotorPowerCommand = (portId: number, power: number) => {
  return new Uint8Array([0x08, 0x00, 0x81, portId, 0x11, 0x51, 0x00, power]);
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

  const runTrainMotor = async () => {
    const success = await writeCharacteristic(
      SERVICE_UUID,
      CHARACTERISTIC_UUID,
      buildDuploMotorPowerCommand(DEFAULT_MOTOR_PORT_ID, MEDIUM_POWER)
    );

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
              <Button onClick={runTrainMotor}>Run train motor</Button>
            </div>
          )}
        </div>
      </Flex>
    </Theme>
  );
}

export default Simplify
