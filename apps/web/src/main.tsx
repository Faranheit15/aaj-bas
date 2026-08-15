import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createLogger } from "@aaj-bas/logger";
import { App } from "./App";
import { registerServiceWorker } from "./register-service-worker";
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

// After the render call, and the module itself waits for `load` before doing
// anything: installing the worker fetches the whole shell, and the first
// edition must not queue behind it (section 27). It is called unconditionally
// here because every condition worth stating -- production, and a browser that
// has the API -- is stated in one place, inside.
registerServiceWorker();
