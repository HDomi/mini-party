import { FirebaseBackend } from './firebase'
import { LocalBackend } from './local'
import type { Backend, RoomData, RoomSettings } from './types'
import { readStored } from '../utils/storage'

const url = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined
const key = import.meta.env.VITE_DB_KEY as string | undefined

export const backend: Backend = url ? new FirebaseBackend(url, key) : new LocalBackend()

const idStore = backend.kind === 'local' ? sessionStorage : localStorage

function stored(storage: Storage, k: string, legacy: string, make: () => string): string {
  const v = readStored(storage, k, legacy)
  if (v) return v
  const n = make()
  try {
    storage.setItem(k, n)
  } catch {
    /* 무시 */
  }
  return n
}

/** 브라우저별로 고정된 id(local backend에서는 탭별이라 탭마다 다른 플레이어가 된다). */
export const playerId = stored(idStore, 'party:pid', 'yutnori:pid', () => crypto.randomUUID().slice(0, 12))

export function savedName(): string {
  return readStored(localStorage, 'party:name', 'yutnori:name') ?? ''
}

export function saveName(name: string) {
  try {
    localStorage.setItem('party:name', name)
  } catch {
    /* 무시 */
  }
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function makeRoomCode(): string {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4}$/

/** 빈 코드를 골라 방을 만든다. 다섯 번 모두 겹치면 null. 연결 실패는 reject된다. */
export async function openRoom(game: { id: string; version: number }, settings: RoomSettings): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const code = makeRoomCode()
    const ok = await backend.createRoom(code, {
      gameType: game.id,
      gameVersion: game.version,
      createdAt: Date.now(),
      hostId: playerId,
      settings,
      game: null,
    })
    if (ok) return code
  }
  return null
}

/**
 * 방을 한 번만 읽는다. 메인화면에서 코드로 어느 게임 방인지 찾을 때 쓴다.
 * RTDB는 연결하지 못하면 조용히 재시도만 계속하므로 `timeoutMs`가 지나면 reject한다.
 */
export function peekRoom(code: string, timeoutMs = 10_000): Promise<RoomData | null> {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      fn()
      // subscribe가 콜백을 동기로 부를 수도 있으므로 unsub이 할당된 뒤인 다음 microtask에 해제한다.
      queueMicrotask(() => unsub())
    }
    const timer = window.setTimeout(() => finish(() => reject(new Error('room lookup timed out'))), timeoutMs)
    const unsub = backend.subscribe(
      code,
      (room) => finish(() => resolve(room)),
      (err) => finish(() => reject(err)),
    )
  })
}

export type { Backend, PlayerInfo, RoomData, RoomSettings } from './types'
