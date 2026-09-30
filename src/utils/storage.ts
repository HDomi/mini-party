/**
 * `key`를 읽는다. 없으면 super-yutnori 시절 키(`legacy`)를 읽어 새 키로 옮긴다.
 * 같은 origin(hdomi.github.io)이라 예전 사이트에서 쓰던 이름·id·볼륨이 그대로 이어진다.
 * 저장소가 막혀 있으면(사생활 보호 모드 등) null.
 */
export function readStored(storage: Storage, key: string, legacy?: string): string | null {
  try {
    const v = storage.getItem(key)
    if (v !== null || !legacy) return v
    const old = storage.getItem(legacy)
    if (old !== null) storage.setItem(key, old)
    return old
  } catch {
    return null
  }
}
