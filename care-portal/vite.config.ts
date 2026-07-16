import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: projectRoot,
  envDir: projectRoot,
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
