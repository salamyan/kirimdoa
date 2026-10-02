import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-rewrite-admin',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url === '/admin' || req.url === '/admin/') {
              req.url = '/admin.html';
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve('index.html'),
          admin: path.resolve('admin.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
