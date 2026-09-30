import { describe, expect, it } from 'vitest'
import { readStored } from './storage'

function memory(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init))
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

describe('readStored', () => {
  it('prefers the new key', () => {
    expect(readStored(memory({ 'party:name': 'a', 'yutnori:name': 'b' }), 'party:name', 'yutnori:name')).toBe('a')
  })

  it('copies the legacy value over once', () => {
    const s = memory({ 'yutnori:name': 'b' })
    expect(readStored(s, 'party:name', 'yutnori:name')).toBe('b')
    expect(s.getItem('party:name')).toBe('b')
  })

  it('returns null when storage throws', () => {
    const s = memory()
    s.getItem = () => {
      throw new Error('blocked')
    }
    expect(readStored(s, 'party:name', 'yutnori:name')).toBeNull()
  })
})
