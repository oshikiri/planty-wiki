import { render } from "preact";

import { App } from "./app";

const rootElement = document.getElementById("root");

if (rootElement) {
  render(<App />, rootElement);
}
