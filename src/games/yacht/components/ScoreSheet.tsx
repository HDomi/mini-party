import { playerId } from '@/net'
import { BONUS, BONUS_AT, bonusLost, CAT_HINT, CAT_LABEL, CATS, countsOf, currentPlayer, scoreCounts, totalsOf, UPPER, type Cat, type GameState } from '../game/rules'
import { PLAYER_COLORS } from './colors'
import { DieIcon } from './DieIcon'
import styles from './ScoreSheet.module.scss'

/** 플레이어마다 한 열인 점수표. 차례인 사람의 빈칸에는 지금 주사위로 받을 점수가 옅게 보인다. */
export function ScoreSheet({
  game,
  preview,
  canPick,
  picked,
  freshSeq,
  onPick,
  onHint,
  className,
}: {
  game: GameState
  /** 굴림이 다 멈춰서 받을 점수를 보여 줄 수 있다. */
  preview: boolean
  /** 내 차례라 칸을 고를 수 있다. */
  canPick: boolean
  picked: Cat | null
  /** 이 `seq` 보다 뒤에 적은 칸만 반짝인다. */
  freshSeq: number
  onPick: (cat: Cat) => void
  onHint: (text: string) => void
  className?: string
}) {
  const cur = game.phase === 'play' ? currentPlayer(game) : null
  const counts = countsOf(game.dice)
  const last = game.last && game.last.seq > freshSeq ? game.last : null

  const head = (
    <tr>
      <th className={styles.corner} scope="col">
        족보
      </th>
      {game.players.map((id, j) => (
        <th key={id} scope="col" className={`${styles.name} ${id === cur ? styles.active : ''} ${game.out.includes(id) ? styles.out : ''}`}>
          <i style={{ background: PLAYER_COLORS[j] }} />
          <span>{game.names[id]}</span>
          {id === playerId && <em>나</em>}
        </th>
      ))}
    </tr>
  )

  const row = (cat: Cat) => {
    const i = CATS.indexOf(cat)
    return (
      <tr key={cat}>
        <th scope="row" className={styles.cat} title={CAT_HINT[cat]} onClick={() => onHint(`${CAT_LABEL[cat]}: ${CAT_HINT[cat]}`)}>
          {i < UPPER && <DieIcon value={i + 1} className={styles.icon} />}
          {CAT_LABEL[cat]}
        </th>
        {game.players.map((id) => {
          const v = game.scores[id][i]
          const active = id === cur
          if (v !== null) {
            const fresh = last?.by === id && last.cat === cat
            return (
              <td key={id} className={`${active ? styles.active : ''} ${fresh ? styles.fresh : ''} ${v === 0 ? styles.zero : ''}`}>
                {v}
              </td>
            )
          }
          if (!active || !preview) return <td key={id} className={active ? styles.active : ''} />
          const score = scoreCounts(cat, counts)
          const mine = canPick && id === playerId
          return (
            <td key={id} className={`${styles.active} ${styles.preview} ${score === 0 ? styles.zero : ''} ${picked === cat ? styles.picked : ''}`}>
              {mine ? (
                <button onClick={() => onPick(cat)} aria-label={`${CAT_LABEL[cat]}에 ${score}점 적기`}>
                  {score}
                </button>
              ) : (
                score
              )}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className={`${styles.wrap} ${className ?? ''}`}>
      <table className={styles.sheet}>
        <thead>{head}</thead>
        <tbody>
          {CATS.slice(0, UPPER).map(row)}
          <tr className={styles.sub}>
            <th scope="row" className={styles.cat} onClick={() => onHint(`보너스: 위 여섯 칸 합이 ${BONUS_AT}점 이상이면 ${BONUS}점`)}>
              보너스 <small>{BONUS_AT}+</small>
            </th>
            {game.players.map((id) => {
              const sheet = game.scores[id]
              const t = totalsOf(sheet)
              const lost = !t.bonus && bonusLost(sheet)
              const text = t.bonus ? `+${BONUS}` : lost ? '0' : `${t.upper}/${BONUS_AT}`
              return (
                <td key={id} className={`${id === cur ? styles.active : ''} ${t.bonus ? styles.bonus : ''} ${lost ? styles.zero : ''}`}>
                  {text}
                </td>
              )
            })}
          </tr>
          {CATS.slice(UPPER).map(row)}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={styles.cat}>
              합계
            </th>
            {game.players.map((id) => (
              <td key={id} className={id === cur ? styles.active : ''}>
                {totalsOf(game.scores[id]).total}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
