import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The chat window (chat.html and its script and styles) is built into dist/, together with the plain loader from public/. The API serves
// dist/ under /widget/ (docs/features/F20-website-chat.md), so every address in the built page starts with /widget/.
export default defineConfig({
  base: '/widget/',
  plugins: [react()],
  build: {
    rollupOptions: { input: { chat: 'chat.html' } },
    // The chat page allows no inline scripts or styles (its security policy forbids them), so nothing is inlined
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
});
