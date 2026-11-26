import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// STANDALONE=1 inlines the lazily loaded 3D scene so 67.html stays one file.
const standalone = process.env.STANDALONE === '1';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: standalone ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  server: { proxy: { '/api': 'http://127.0.0.1:6757' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:6757' } },
});
