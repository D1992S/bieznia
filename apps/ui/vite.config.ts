import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('@tanstack')) {
            return 'vendor-tanstack';
          }
          if (id.includes('zod')) {
            return 'vendor-zod';
          }
          return undefined;
        },
      },
    },
  },
});
