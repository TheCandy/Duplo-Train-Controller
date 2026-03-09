import { Theme, Flex, Text, Button, ThemePanel } from "@radix-ui/themes";
import { useBluetooth } from './hooks/use-bluetooth';
import { useState } from 'react';


const SERVICE_UUID = '00001623-1212-efde-1623-785feabcd123';
const CHARACTERISTIC_UUID = '00001624-1212-efde-1623-785feabcd123';


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
    writeCharacteristic
  } = useBluetooth();


  const [data, setData] = useState<string>('');
  const [inputValue, setInputValue] = useState('');

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

  const readData = async () => {
    const value = await readCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID);
    if (value) {
      const decoder = new TextDecoder();
      const text = decoder.decode(value);
      setData(text);
    }
  };

  const writeData = async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(inputValue);
    const success = await writeCharacteristic(SERVICE_UUID, CHARACTERISTIC_UUID, data);
    if (success) {
      console.log('Data written successfully');
      setInputValue('');
    }
  };

  if (!isSupported) {
    return <div>Web Bluetooth not supported</div>;
  }

  return (
    <Theme>
      <Flex direction="column" gap="2">
        <Text>Duplo train</Text>
        <Button onClick={connectToDevice} disabled={isConnecting}>Select Device</Button>
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
                <Button onClick={readData}>Read Data</Button>
                <p>Read Value: {data}</p>
                <Button onClick={disconnect}>Disconnect</Button>
              </>)}
          </div>
        )}

        {error && <p>Error: {error}</p>}
      </Flex>
      <ThemePanel />
    </Theme>
  )
}

export default App
