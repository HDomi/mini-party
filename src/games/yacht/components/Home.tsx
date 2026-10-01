import { useState } from 'react'
import { backend, openRoom, saveName, savedName } from '@/net'
import { Link } from '@/router'
import { yacht } from '../room'
import { DieIcon } from './DieIcon'
import { Backdrop } from './Backdrop'
import styles from './Menu.module.scss'

export function Logo() {
  return (
    <div className={styles.logo} aria-hidden>
      {[1, 2, 3, 4, 5].map((v) => (
        <DieIcon key={v} value={v} />
      ))}
    </div>
  )
}

export function Home({
  initialCode,
  onEnter,
  onSolo,
}: {
  initialCode: string | null
  onEnter: (name: string, code: string) => void
  onSolo: (name: string) => void
}) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(initialCode ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const trimmed = name.trim().slice(0, 10)

  const enter = (c: string) => {
    saveName(trimmed)
    onEnter(trimmed, c)
  }

  const create = async () => {
    if (!trimmed) return setErr('이름을 먼저 입력해 주세요')
    setBusy(true)
    try {
      const c = await openRoom(yacht, { ...yacht.defaultSettings })
      if (c) return enter(c)
      setErr('방을 만들지 못했어요. 다시 시도해 주세요')
    } catch (e) {
      console.error(e)
      setErr('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요')
    }
    setBusy(false)
  }

  const solo = () => {
    if (!trimmed) return setErr('이름을 먼저 입력해 주세요')
    saveName(trimmed)
    onSolo(trimmed)
  }

  const join = () => {
    if (!trimmed) return setErr('이름을 먼저 입력해 주세요')
    const c = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{4}$/.test(c)) return setErr('방 코드는 4글자예요')
    enter(c)
  }

  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />
      <div className={styles.card}>
        <Link to="/" className={`btn ghost small ${styles.back}`}>
          ← 게임 목록
        </Link>
        <Logo />
        <h1 className={styles.title}>
          <span>요트</span> 다이스
        </h1>
        <p className={styles.subtitle}>주사위 다섯 개로 족보를 채워요!</p>

        <label className={styles.field}>
          <span>내 이름</span>
          <input
            className={styles.input}
            value={name}
            maxLength={10}
            placeholder="예: 도미"
            onChange={(e) => {
              setName(e.target.value)
              setErr(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (initialCode ? join() : create())}
          />
        </label>

        {initialCode ? (
          <button className="btn primary big" onClick={join}>
            {initialCode} 방에 들어가기
          </button>
        ) : (
          <>
            <div className={styles.stack}>
              <button className="btn primary big" onClick={create} disabled={busy}>
                {busy ? '만드는 중…' : '새 방 만들기'}
              </button>
              <button className="btn big" onClick={solo} disabled={busy}>
                봇이랑 하기
              </button>
            </div>
            <div className={styles.divider}>
              <span>또는</span>
            </div>
            <div className={styles.joinRow}>
              <input
                className={`${styles.input} ${styles.code}`}
                value={code}
                maxLength={4}
                placeholder="CODE"
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setErr(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
              <button className="btn" onClick={join}>
                입장
              </button>
            </div>
          </>
        )}
        {err && <p className="err">{err}</p>}
        {backend.kind === 'local' && <p className="hint">로컬 모드: 같은 브라우저의 탭끼리만 연결돼요</p>}
      </div>
    </main>
  )
}
