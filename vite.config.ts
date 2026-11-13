import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend/src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Bibliotecas em arquivos separados: mudam pouco e o navegador guarda em cache
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'react';
            if (/[\\/]node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/.test(id)) return 'motion';
            if (/[\\/]node_modules[\\/](@xyflow|d3-[^\\/]+|dagre|graphlib|lodash|zustand|classcat)[\\/]/.test(id)) return 'graficos';
            return undefined;
          },
        },
      },
    },
    server: {
      // DISABLE_HMR=true desliga o recarregamento automático do navegador no modo dev
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
