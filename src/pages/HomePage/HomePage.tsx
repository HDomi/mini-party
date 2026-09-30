import { useEffect, useState, type CSSProperties } from 'react'
import { GAMES, gameById, type GameEntry } from '@/games/registry'
import { backend, peekRoom, ROOM_CODE_PATTERN } from '@/net'
import { Link, navigate } from '@/router'
import { ForestBackdrop } from './ForestBackdrop'
import styles from './HomePage.module.scss'

/** 모바일 브라우저 상단바 색. 숲 하늘 윗부분과 맞춘다. */
const THEME_COLOR = '#9fdcff'

/** 게임 목록과, 코드만으로 어느 게임 방이든 들어가는 입력칸. */
export function HomePage() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = meta?.getAttribute('content')
    meta?.setAttribute('content', THEME_COLOR)
    return () => {
      if (prev) meta?.setAttribute('content', prev)
    }
  }, [])

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
      <ForestBackdrop />

      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            미니 <span>파티</span>
          </h1>
          <p className={styles.subtitle}>친구들이랑 한 판 하자!</p>
        </header>

        <section aria-labelledby="games-title">
          <h2 id="games-title" className={styles.sectionTitle}>
            게임 고르기
          </h2>
          <ul className={styles.games}>
            {GAMES.map((g) => (
              <li key={g.id}>
                <GameTile game={g} />
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.join}>
          <label htmlFor="join-code">방 코드가 있어요</label>
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
            <button className={styles.joinBtn} onClick={() => void join()} disabled={busy}>
              {busy ? '찾는 중…' : '입장'}
            </button>
          </div>
          {err && <p className={styles.err}>{err}</p>}
        </section>

        <footer className={styles.footer}>
          {backend.kind === 'local' && <p>로컬 모드: 같은 브라우저의 탭끼리만 연결돼요</p>}
          <p>
            사진:{' '}
            {GAMES.flatMap((g) => (g.credit ? [{ id: g.id, credit: g.credit }] : [])).map(({ id, credit }, i) => (
              <span key={id}>
                {i > 0 && ' · '}
                <a href={credit.url} target="_blank" rel="noreferrer">
                  {credit.author}, “{credit.title}”
                </a>{' '}
                (
                <a href={credit.licenseUrl} target="_blank" rel="noreferrer">
                  {credit.license}
                </a>
                )
              </span>
            ))}
          </p>
        </footer>
      </div>
    </main>
  )
}

function GameTile({ game }: { game: GameEntry }) {
  // 작은 SVG 는 Vite 가 data URL 로 인라인하므로 따옴표로 감싼다.
  const style = { '--accent': game.color, '--cover': `url("${game.cover}")` } as CSSProperties
  const body = (
    <>
      <span className={styles.cover} aria-hidden />
      <span className={styles.badge}>{game.App ? '시작 ▶' : '준비 중'}</span>
      <span className={styles.body}>
        <strong>{game.title}</strong>
        <span className={styles.tagline}>{game.tagline}</span>
        <span className={styles.tags}>
          {game.tags.map((t) => (
            <em key={t}>{t}</em>
          ))}
        </span>
      </span>
    </>
  )
  if (!game.App) {
    return (
      <div className={`${styles.tile} ${styles.soon}`} style={style} aria-disabled="true">
        {body}
      </div>
    )
  }
  return (
    <Link to={`/${game.slug}`} className={styles.tile} style={style}>
      {body}
    </Link>
  )
}
