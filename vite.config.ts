import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { passwordGate } from './scripts/vite-plugin-password-gate.ts'

// GitHub Pages serves the site under /<repo>/.
// PLAY_PW is read at build time only (no VITE_ prefix, so it never reaches client code).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.VITE_BASE ?? '/super-yutnori/') : '/',
  plugins: [react(), passwordGate(process.env.PLAY_PW)],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    // The password gate decrypts one bundle, so keep everything in a single chunk.
    rolldownOptions: { output: { codeSplitting: false } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
