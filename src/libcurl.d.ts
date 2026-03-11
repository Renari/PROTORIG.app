declare module 'libcurl.js/bundled' {
  export const libcurl: {
    load_wasm: () => Promise<void>;
    set_websocket: (url: string) => void;
    fetch: typeof fetch;
  };
}
