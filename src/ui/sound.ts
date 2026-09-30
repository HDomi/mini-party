// 효과음. 볼륨은 0(음소거)에서 시작하고 브라우저별로 기억된다.
// 파일은 public/sfx 에 `<name>-<n>.ogg|m4a` 형식으로 있다. public/sfx/CREDITS.txt 참고.
// 쓸 만한 곡을 찾을 때까지 배경음악은 꺼 둔다: 아래 `bgm` 블록은 주석 처리돼 있고,
// BGM_URL 에 반복 재생용 파일을 두고 주석을 풀면 다시 켜진다.

const BASE = `${import.meta.env.BASE_URL}sfx/`
// Safari 는 AAC 는 디코딩하지만 Vorbis 는 항상 되지는 않으므로, 모든 효과음을 두 형식으로 둔다.
const EXT = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'
// const BGM_URL = `${BASE}bgm.mp3`
// const BGM_GAIN = 0.35
const KEY = 'yutnori:volume'

/** 소리마다 `n` 개의 변형을 두고, 반복이 기계적으로 들리지 않도록 무작위로 고른다. */
const SOUNDS = {
  throw: { n: 3, gain: 0.7 },
  land: { n: 5, gain: 0.9 },
  step: { n: 5, gain: 0.6 },
  stack: { n: 3, gain: 0.9 },
  capture: { n: 3, gain: 0.9 },
  goal: { n: 1, gain: 0.7 },
  yut: { n: 1, gain: 0.6 },
  mo: { n: 1, gain: 0.6 },
  win: { n: 1, gain: 0.7 },
  turn: { n: 1, gain: 0.6 },
  click: { n: 1, gain: 0.4 },
} as const
export type SoundName = keyof typeof SOUNDS

let volume = readVolume()
let ctx: AudioContext | null = null
let master: GainNode | null = null
// let bgm: HTMLAudioElement | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()
const listeners = new Set<() => void>()

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
  } catch {
    return 0
  }
}

// 제곱 곡선을 쓰면 체감 음량이 선형에 더 가깝다.
const curve = (v: number) => v * v

export function getVolume() {
  return volume
}

export function subscribeVolume(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v))
  try {
    localStorage.setItem(KEY, String(volume))
  } catch {
    /* 무시 */
  }
  listeners.forEach((fn) => fn())
  // 드래그나 클릭에서 호출되므로, 브라우저가 오디오 시작을 허용하는 곳도 여기다.
  unlock()
}

/** 사용자 제스처가 필요하다: 그 전까지 브라우저는 오디오를 suspended 상태로 둔다. */
function unlock() {
  if (volume === 0) {
    // bgm?.pause()
    return
  }
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    for (const [name, s] of Object.entries(SOUNDS)) for (let i = 1; i <= s.n; i++) void load(`${BASE}${name}-${i}.${EXT}`)
  }
  master!.gain.value = curve(volume)
  if (ctx.state === 'suspended') void ctx.resume()

  // if (!bgm) {
  //   bgm = new Audio(BGM_URL)
  //   bgm.loop = true
  //   bgm.addEventListener('error', () => console.warn(`background music not found at ${BGM_URL}`), { once: true })
  // }
  // bgm.volume = curve(volume) * BGM_GAIN
  // if (bgm.paused && !document.hidden) bgm.play().catch(() => {})
}

function load(url: string) {
  let p = buffers.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
      .then((data) => ctx!.decodeAudioData(data))
      .catch((err) => {
        console.warn(`sound ${url} failed`, err)
        return null
      })
    buffers.set(url, p)
  }
  return p
}

export function play(name: SoundName, gain = 1) {
  if (volume === 0 || !ctx || !master || ctx.state !== 'running') return
  // 자동화용 테스트 훅. 프로덕션 빌드에서는 제거된다
  if (import.meta.env.DEV) ((window as unknown as { __sfx?: string[] }).__sfx ??= []).push(name)
  const s = SOUNDS[name]
  const url = `${BASE}${name}-${1 + Math.floor(Math.random() * s.n)}.${EXT}`
  void load(url).then((buf) => {
    if (!buf || !ctx || !master) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.94 + Math.random() * 0.12
    const g = ctx.createGain()
    g.gain.value = s.gain * gain
    src.connect(g).connect(master)
    src.start()
  })
}

if (typeof document !== 'undefined') {
  // 저장된 볼륨만으로는 로드 시 오디오를 시작할 수 없다. 어디든 처음 탭하면 시작된다.
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, { capture: true })
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button')) play('click')
  })
  // document.addEventListener('visibilitychange', () => {
  //   if (document.hidden) bgm?.pause()
  //   else if (volume > 0) unlock()
  // })
}
