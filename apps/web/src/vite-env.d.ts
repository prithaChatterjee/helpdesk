/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry project DSN for browser error reports; unset, nothing is reported */
  readonly VITE_SENTRY_DSN?: string;
  /** Sentry environment name; defaults to the Vite mode (`development`, `production`) */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
