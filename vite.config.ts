import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { passwordGate } from './scripts/vite-plugin-password-gate.ts'

// GitHub Pages는 사이트를 /<repo>/ 아래에서 서빙한다.
// PLAY_PW는 빌드 시점에만 읽는다(VITE_ 접두사가 없어 클라이언트 코드에 절대 들어가지 않는다).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? (process.env.VITE_BASE ?? '/super-yutnori/') : '/',
  plugins: [react(), passwordGate(process.env.PLAY_PW)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    // password gate는 번들 하나만 복호화하므로 전부 단일 chunk로 묶는다.
    rolldownOptions: { output: { codeSplitting: false } },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
}))
