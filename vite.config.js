import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins: [react()], base: './', server: {host: '127.0.0.1'}, build: {rollupOptions: {output: {manualChunks: {firebase: ['firebase/app','firebase/auth','firebase/database'],react: ['react','react-dom']}}}}});
