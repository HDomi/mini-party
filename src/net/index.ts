import { FirebaseBackend } from './firebase'
import { LocalBackend } from './local'
import type { Backend } from './types'

const url = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined
const key = import.meta.env.VITE_DB_KEY as string | undefined

export const backend: Backend = url ? new FirebaseBackend(url, key) : new LocalBackend()

const idStore = backend.kind === 'local' ? sessionStorage : localStorage

function stored(storage: Storage, k: string, make: () => string): string {
  try {
    const v = storage.getItem(k)
    if (v) return v
    const n = make()
    storage.setItem(k, n)
    return n
  } catch {
    return make()
  }
}

/** Stable per-browser id (per-tab with the local backend, so tabs act as players). */
export const playerId = stored(idStore, 'yutnori:pid', () => crypto.randomUUID().slice(0, 12))

export function savedName(): string {
  try {
    return localStorage.getItem('yutnori:name') ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem('yutnori:name', name)
  } catch {
    /* ignore */
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makeRoomCode(): string {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export type { Backend, PlayerInfo, RoomData, RoomSettings } from './types'
