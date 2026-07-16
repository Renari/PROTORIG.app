# PROTORIG.app

A Svelte-based tool designed to help you track, filter, and analyze your gacha pulls for Arknights: Endfield. 

## Getting Started

### Prerequisites

- Node.js (v22 or higher recommended)
- `npm` or `bun`

### Development

The application consists of a frontend development server and a wisp proxy server (needed for handling external requests/CORS).

To run the application locally:

```bash
npm run dev
```

This starts both the Vite dev server and the wisp proxy together using `concurrently`.

The application will be accessible at `http://localhost:5173`.

### Building for Production

To create a production build of the frontend and compile the backend proxy server:

```bash
npm run build
```

This will run `vite build` to optimize the frontend into the `dist/` directory and compile the `wisp-server.mjs` using `bun`.

### Updating historical banner metadata

Maintainers can update `src/lib/banners.jsonc` from the Endfield APIs with:

```bash
./scripts/update-banners.sh
```

The script prompts for a webview URL containing a valid `u8_token`, discovers pool IDs from the record APIs, confirms active metadata through `/api/content`, and preserves existing historical entries. Use `--dry-run` to preview the resulting JSON, or `--pool-id ID` to check a known public pool ID without a token.

## Tech Stack

- **Frontend**: [Svelte](https://svelte.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Proxy/Backend**: Node.js, [wisp-js](https://github.com/MercuryWorkshop/wisp-js)
