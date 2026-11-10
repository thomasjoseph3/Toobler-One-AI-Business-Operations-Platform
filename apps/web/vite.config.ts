import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The staff app. In development the API runs on port 4000; requests to /api are passed on to it, so the browser sees
// one address and the session cookie works without any cross-site settings. Browser tests start their own API and point
// this at it with API_PROXY_TARGET, so they never reach the API you have running.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000' },
  },
});
