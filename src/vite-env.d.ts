/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'file-saver' {
  export function saveAs(data: Blob | File | string, filename?: string, options?: { autoBom?: boolean }): void
}
