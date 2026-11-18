import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served in middleware mode by src/server/dev.ts (same origin as /api).
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
});
