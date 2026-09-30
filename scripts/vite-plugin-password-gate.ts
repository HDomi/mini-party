import { webcrypto } from 'node:crypto'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

// 빌드된 JS 번들을 비밀번호로 암호화한다(PBKDF2 -> AES-GCM).
// 배포된 페이지에는 암호문과, 비밀번호를 물어 브라우저에서 복호화하는
// 작은 로더만 들어 있다. 비밀번호도, 그 해시도 dist/에 남지 않는다.

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

// prompt() 대신 페이지 내 폼으로 비밀번호를 묻는다. 인앱 브라우저(KakaoTalk, Instagram 등)나
// 대화상자가 차단된 탭에서는 prompt()가 아무것도 띄우지 않고 null을 반환하는데,
// 예전에는 이게 곧바로 "비밀번호 틀림"처럼 보였다.
function loader(binUrl: string): string {
  return `(async()=>{
// crypto.subtle 은 HTTPS 에서만 있다. 카카오톡 등이 scheme 없는 링크를 http:// 로 열면 https 로 옮긴다.
if(location.protocol==='http:'&&!/^(localhost|127\\.|\\[::1\\])/.test(location.hostname)){location.replace('https:'+location.href.slice(5));return}
const K='party:pw';
const bin=fetch(${JSON.stringify(binUrl)}).then(async r=>{if(!r.ok||/html/.test(r.headers.get('content-type')||''))throw 0;return new Uint8Array(await r.arrayBuffer())});
bin.catch(()=>{});
const ready=new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r());
const fail=async msg=>{await ready;document.body.textContent=msg};
const s=crypto&&crypto.subtle;
if(!s)return fail('이 브라우저에서는 열 수 없어요. 다른 브라우저로 열어 주세요.');
let buf;
const run=async pw=>{
if(!buf)buf=await bin;
let plain;
try{
const base=await s.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
const key=await s.deriveKey({name:'PBKDF2',salt:buf.slice(0,16),iterations:${ITERATIONS},hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
plain=await s.decrypt({name:'AES-GCM',iv:buf.slice(16,28)},key,buf.slice(28));
}catch(e){return false}
try{sessionStorage.setItem(K,pw)}catch(e){}
const g=document.getElementById('pw-gate');if(g)g.remove();
const el=document.createElement('script');el.type='module';
el.src=URL.createObjectURL(new Blob([plain],{type:'text/javascript'}));
document.head.appendChild(el);
return true;
};
try{
let saved=null;try{saved=sessionStorage.getItem(K)}catch(e){}
// 저장된 비밀번호가 오래됐으면(예: PLAY_PW 변경 후) 입력 폼으로 넘어간다.
if(saved){if(await run(saved))return;try{sessionStorage.removeItem(K)}catch(e){}}
await ready;
const gate=document.createElement('main');
gate.id='pw-gate';gate.className='center-screen';gate.style.cssText='position:fixed;inset:0;z-index:10;background:linear-gradient(180deg,#9fdcff,#d9f3ff 55%,#f2fbe6)';
gate.innerHTML='<form class="home-card"><h1 class="title small">미니 <span style="color:#57b85f">파티</span></h1><p class="subtitle">비밀번호를 입력해 주세요</p><label class="field"><span>비밀번호</span><input type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required></label><button class="btn primary big" style="background:#57b85f">들어가기</button><p class="err" hidden></p></form>';
document.body.appendChild(gate);
const form=gate.querySelector('form'),input=gate.querySelector('input'),btn=gate.querySelector('button'),err=gate.querySelector('.err');
input.focus();
form.addEventListener('submit',async e=>{
e.preventDefault();
if(!input.value||btn.disabled)return;
btn.disabled=true;btn.textContent='확인 중…';err.hidden=true;
let ok=false;
try{ok=await run(input.value)}catch(e){return fail('불러오지 못했어요. 새로고침해 주세요.')}
if(ok)return;
btn.disabled=false;btn.textContent='들어가기';
err.textContent='비밀번호가 틀렸어요';err.hidden=false;
input.select();
});
}catch(e){fail('불러오지 못했어요. 새로고침해 주세요.')}
})()`
}
