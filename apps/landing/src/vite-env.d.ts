/// <reference types="vite/client" />

// Declared explicitly so the CTA URL is `string | undefined` rather than the `any`
// Vite's index signature would otherwise hand back.
interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
}
