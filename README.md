# PROTORIG.app

A Svelte-based tool designed to help you track, filter, and analyze your gacha pulls for Arknights: Endfield. 

## Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- `npm` or `bun`

### Development

The application consists of a frontend development server and a wisp proxy server (needed for handling external requests/CORS). 

To run the application locally, start both the frontend development server and the backend wisp proxy in separate terminal instances:

1. **Start the Frontend Development and Wisp Proxy Server:**
   ```bash
   npm run dev
   ```

The application will be accessible at `http://localhost:5173`.

### Building for Production

To create a production build of the frontend and compile the backend proxy server:

```bash
npm run build
```

This will run `vite build` to optimize the frontend into the `dist/` directory and compile the `wisp-server.mjs` using `bun`.

## Tech Stack

- **Frontend**: [Svelte](https://svelte.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Proxy/Backend**: Node.js, [wisp-js](https://github.com/MercuryWorkshop/wisp-js)
