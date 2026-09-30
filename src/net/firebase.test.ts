import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  goOnline: vi.fn(),
  goOffline: vi.fn(),
  // 나가기 transaction은 테스트가 resolve할 때까지 pending 상태로 남는다.
  pending: [] as (() => void)[],
}))

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  goOnline: db.goOnline,
  goOffline: db.goOffline,
  ref: (_db: unknown, path: string) => ({ path }),
  onValue: () => () => {},
  onDisconnect: () => ({ update: async () => {}, cancel: async () => {} }),
  runTransaction: () =>
    new Promise((resolve) => db.pending.push(() => resolve({ committed: true }))),
  serverTimestamp: () => ({}),
  update: async () => {},
  remove: async () => {},
}))

const { FirebaseBackend } = await import('./firebase')

const KEY = 'test-key-0123456789'
const player = { id: 'a', name: 'a', team: 0, online: true, joinedAt: 0 }

async function settle() {
  db.pending.splice(0).forEach((resolve) => resolve())
  await vi.advanceTimersByTimeAsync(0)
}

describe('FirebaseBackend connection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    db.goOnline.mockClear()
    db.goOffline.mockClear()
    db.pending.length = 0
  })
  afterEach(() => vi.useRealTimers())

  it('goes offline shortly after the last listener leaves', async () => {
    const b = new FirebaseBackend('https://x', KEY)
    const unsub = b.subscribe('ABCD', () => {})
    expect(db.goOnline).toHaveBeenCalledTimes(1)
    unsub()
    unsub()
    await vi.advanceTimersByTimeAsync(1999)
    expect(db.goOffline).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(db.goOffline).toHaveBeenCalledTimes(1)
  })

  it('stays online until the leave write lands', async () => {
    const b = new FirebaseBackend('https://x', KEY)
    const stop = b.join('ABCD', player)
    stop(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(db.goOffline).not.toHaveBeenCalled()
    await settle()
    await vi.advanceTimersByTimeAsync(2000)
    expect(db.goOffline).toHaveBeenCalledTimes(1)
  })

  it('does not bounce the socket on a rename re-join', async () => {
    const b = new FirebaseBackend('https://x', KEY)
    const unsub = b.subscribe('ABCD', () => {})
    b.join('ABCD', player)(false)
    b.join('ABCD', { ...player, name: 'b' })
    await settle()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(db.goOffline).not.toHaveBeenCalled()
    unsub()
    await vi.advanceTimersByTimeAsync(2000)
    // 두 번째 좌석은 아직 입장한 상태다.
    expect(db.goOffline).not.toHaveBeenCalled()
  })

  it('holds the connection for a write made from Home', async () => {
    const b = new FirebaseBackend('https://x', KEY)
    const created = b.createRoom('ABCD', { createdAt: 0, hostId: 'a', settings: { teamMode: false, teamCount: 2, piecesPerTeam: 4 } })
    await vi.advanceTimersByTimeAsync(5000)
    expect(db.goOffline).not.toHaveBeenCalled()
    await settle()
    await expect(created).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(db.goOffline).toHaveBeenCalledTimes(1)
  })
})
