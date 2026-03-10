import { Theme, Switch } from "@radix-ui/themes";
import { useState } from 'react';
import Simplify from "./Simplify";
import AIMade from "./AI_Made";

function App() {
  const [renderSimplify, setRenderSimplify] = useState<boolean>(false);

  return (
    <Theme>
      <Switch checked={renderSimplify} onClick={_ => setRenderSimplify(x => !x)} />
      {renderSimplify ? <Simplify /> : <AIMade />}
    </Theme>
  );
}

export default App
