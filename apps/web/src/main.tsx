import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createLogger } from "@aaj-bas/logger";
import { App } from "./App";
import "./styles.css";

// The entry point owns the environment read: shared packages carry no
// `vite/client` types, and `import.meta.env.DEV` folds to a literal at build
// time, so production ships a constant threshold.
const log = createLogger("web", import.meta.env.DEV ? "debug" : "warn");

const rootElement = document.getElementById("root");

if (rootElement === null) {
  log.error("Root element is missing; the application cannot mount.");
  throw new Error("The application root element is missing.");
}

log.debug("Mounting application.");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
