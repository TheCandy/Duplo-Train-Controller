import { Theme, Flex, Text, Button, ThemePanel } from "@radix-ui/themes";

function App() {
  return (
    <Theme>
      <Flex direction="column" gap="2">
        <Text>Duplo train</Text>
        <Button onClick={() => console.log("Button clicked")}>Let's go</Button>
      </Flex>
      <ThemePanel />
    </Theme>
  )
}

export default App
