import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { passwordGate } from './scripts/vite-plugin-password-gate.ts'

// 빌드마다 바뀌는 버전. 열려 있는 탭은 dist/version.json 과 비교해 새 배포를 알아챈다(src/version.ts).
// 개발 서버와 테스트는 'dev' 라 비교하지 않는다.
function versionFile(version: string): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) })
    },
  }
}

// GitHub Pages는 사이트를 /<repo>/ 아래에서 서빙한다. 라우터가 이 값(BASE_URL)을 경로 앞에 붙인다.
// PLAY_PW는 빌드 시점에만 읽는다(VITE_ 접두사가 없어 클라이언트 코드에 절대 들어가지 않는다).
export default defineConfig(({ command, isPreview }) => {
  const version = command === 'build' ? String(Date.now()) : 'dev'
  return {
    base: command === 'build' || isPreview ? (process.env.VITE_BASE ?? '/mini-party/') : '/',
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react(), versionFile(version), passwordGate(process.env.PLAY_PW)],
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
  }
})
