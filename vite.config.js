import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Oberfläche liegt in src/renderer, fertiger Build in dist/renderer (liefert der lokale Server aus)
export default defineConfig({
  root: path.resolve('src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve('dist/renderer'),
    emptyOutDir: true
  }
})
