import { webcrypto } from 'node:crypto'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

// Encrypts the built JS bundle with a password (PBKDF2 -> AES-GCM).
// The deployed page only holds ciphertext plus a tiny loader that asks for the
// password and decrypts in the browser. Neither the password nor a hash of it
// ends up in dist/.

const ITERATIONS = 600_000

export function passwordGate(password: string | undefined): Plugin {
  let config: ResolvedConfig
  return {
    name: 'password-gate',
    apply: 'build',
    configResolved(c) {
      config = c
    },
    async closeBundle() {
      if (!password) {
        if (process.env.CI) throw new Error('[password-gate] PLAY_PW is empty; refusing to deploy an ungated build')
        config.logger.warn('[password-gate] PLAY_PW not set, skipping encryption (local build only)')
        return
      }
      const outDir = resolve(config.root, config.build.outDir)
      const htmlPath = join(outDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf8')

      const tag = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/)
      if (!tag) throw new Error('[password-gate] entry script not found in index.html')
      const jsFiles = listFiles(outDir).filter((f) => f.endsWith('.js'))
      if (jsFiles.length !== 1) {
        throw new Error(`[password-gate] expected a single JS bundle, got ${jsFiles.length}: ${jsFiles.join(', ')}`)
      }
      const jsPath = jsFiles[0]
      const code = readFileSync(jsPath)

      const salt = webcrypto.getRandomValues(new Uint8Array(16))
      const iv = webcrypto.getRandomValues(new Uint8Array(12))
      const base = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
        'deriveKey',
      ])
      const key = await webcrypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt'],
      )
      const cipher = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, code))

      const binPath = jsPath.replace(/\.js$/, '.bin')
      writeFileSync(binPath, Buffer.concat([salt, iv, cipher]))
      rmSync(jsPath)
      rmSync(`${jsPath}.map`, { force: true })

      const binUrl = tag[1].replace(/\.js$/, '.bin')
      html = html.replace(tag[0], `<script>${loader(binUrl)}</script>`)
      html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
      writeFileSync(htmlPath, html)

      for (const f of listFiles(outDir)) {
        if (readFileSync(f).includes(password)) throw new Error(`[password-gate] password leaked into ${f}`)
      }
      config.logger.info(`[password-gate] encrypted ${jsPath.slice(outDir.length + 1)}`)
    },
  }
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

function loader(binUrl: string): string {
  return `(async()=>{
const K='yutnori:pw';
const deny=()=>{alert('비밀번호가 필요합니다');window.close();location.replace('about:blank')};
let pw=null;try{pw=sessionStorage.getItem(K)}catch(e){}
if(!pw)pw=prompt('비밀번호를 입력해줘');
if(!pw)return deny();
let buf;
try{const r=await fetch(${JSON.stringify(binUrl)});if(!r.ok||/html/.test(r.headers.get('content-type')||''))throw 0;buf=new Uint8Array(await r.arrayBuffer())}
catch(e){document.body.textContent='불러오기에 실패했어. 새로고침해줘.';return}
try{
const s=crypto.subtle;
const base=await s.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
const key=await s.deriveKey({name:'PBKDF2',salt:buf.slice(0,16),iterations:${ITERATIONS},hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
const plain=await s.decrypt({name:'AES-GCM',iv:buf.slice(16,28)},key,buf.slice(28));
try{sessionStorage.setItem(K,pw)}catch(e){}
const el=document.createElement('script');el.type='module';
el.src=URL.createObjectURL(new Blob([plain],{type:'text/javascript'}));
document.head.appendChild(el);
}catch(e){try{sessionStorage.removeItem(K)}catch(_){}deny()}
})()`
}
