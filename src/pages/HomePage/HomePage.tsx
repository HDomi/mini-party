import { useState } from 'react'
import { GAMES, gameById } from '@/games/registry'
import { backend, peekRoom, ROOM_CODE_PATTERN } from '@/net'
import { Link, navigate } from '@/router'
import styles from './HomePage.module.scss'

/** 게임 목록과, 코드만으로 어느 게임 방이든 들어가는 입력칸. */
export function HomePage() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const join = async () => {
    const c = code.trim().toUpperCase()
    if (!ROOM_CODE_PATTERN.test(c)) return setErr('방 코드는 4글자예요')
    setBusy(true)
    try {
      const room = await peekRoom(c)
      const game = room && gameById(room.gameType)
      if (game) return navigate(`/${game.slug}/${c}`)
      setErr(room ? '지금은 들어갈 수 없는 게임이에요' : `${c} 방을 찾지 못했어요`)
    } catch (e) {
      console.error(e)
      setErr('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요')
    }
    setBusy(false)
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            미니 <span>파티</span>
          </h1>
          <p className={styles.subtitle}>친구들이랑 한 판 하자!</p>
        </header>

        <ul className={styles.games}>
          {GAMES.map((g) =>
            g.App ? (
              <li key={g.id}>
                <Link to={`/${g.slug}`} className={styles.game}>
                  <strong>{g.title}</strong>
                  <span>{g.tagline}</span>
                  <small>{g.players}</small>
                </Link>
              </li>
            ) : (
              <li key={g.id}>
                <div className={`${styles.game} ${styles.soon}`} aria-disabled="true">
                  <strong>{g.title}</strong>
                  <span>{g.tagline}</span>
                  <small>준비 중</small>
                </div>
              </li>
            ),
          )}
        </ul>

        <section className={styles.join}>
          <label htmlFor="join-code">방 코드로 들어가기</label>
          <div className={styles.joinRow}>
            <input
              id="join-code"
              value={code}
              maxLength={4}
              placeholder="CODE"
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                setErr(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && !busy && void join()}
            />
            <button className="btn primary" onClick={() => void join()} disabled={busy}>
              {busy ? '찾는 중…' : '입장'}
            </button>
          </div>
          {err && <p className="err">{err}</p>}
        </section>

        {backend.kind === 'local' && <p className="hint">로컬 모드: 같은 브라우저의 탭끼리만 연결돼요</p>}
      </div>
    </main>
  )
}
