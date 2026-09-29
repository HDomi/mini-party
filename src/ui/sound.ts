// Sound effects. Volume starts at 0 (muted) and is remembered per browser.
// Files live in public/sfx as `<name>-<n>.ogg|m4a`; see public/sfx/CREDITS.txt.
// Background music is disabled until we find a track worth using: the `bgm` blocks below are
// commented out, and dropping a looping file at BGM_URL plus uncommenting them turns it back on.

const BASE = `${import.meta.env.BASE_URL}sfx/`
// Safari decodes AAC but not always Vorbis, so every effect ships in both.
const EXT = typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'
// const BGM_URL = `${BASE}bgm.mp3`
// const BGM_GAIN = 0.35
const KEY = 'yutnori:volume'

/** `n` variants per sound, picked at random so repeats don't sound mechanical. */
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

// Loudness feels closer to linear on a squared curve.
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
    /* ignore */
  }
  listeners.forEach((fn) => fn())
  // Called from a drag or click, so this is also where browsers let audio start.
  unlock()
}

/** Needs a user gesture: browsers keep audio suspended until then. */
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
  // test hook for automation; stripped from production builds
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
  // A saved volume can't start audio on load; the first tap anywhere does.
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlock, { capture: true })
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button')) play('click')
  })
  // document.addEventListener('visibilitychange', () => {
  //   if (document.hidden) bgm?.pause()
  //   else if (volume > 0) unlock()
  // })
}
