import { useState } from 'react'
import { playerId, type PlayerInfo } from '@/net'
import { absoluteUrl } from '@/router'
import { RULE_LABEL, type Rule } from '../game/rules'
import { omokPath } from '../paths'
import { SEAT, omok, type OmokRoomApi } from '../room'
import { Backdrop } from './Backdrop'
import styles from './Menu.module.scss'

const RULE_HINT: Record<Rule, string> = {
  free: '흑백 모두 다섯 알 이상 이으면 이겨요',
  renju: '흑은 삼삼·사사·장목(여섯 알 이상)을 둘 수 없어요',
}

export function Lobby({
  code,
  api,
  onLeave,
  onRename,
}: {
  code: string
  api: OmokRoomApi
  onLeave: () => void
  onRename: (name: string) => void
}) {
  const { room, players, hostId, me } = api
  const [copied, setCopied] = useState(false)
  if (!room) return null
  const rule = room.settings.rule
  const isHost = hostId === playerId
  const link = absoluteUrl(omokPath(code))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      api.flash('복사하지 못했어요. 주소창의 링크를 보내 주세요')
    }
  }

  const at = (seat: number) => players.filter((p) => p.team === seat)
  const watchers = at(SEAT.watch)

  // 빈 자리이거나 오프라인인 사람만 있는 자리에 앉는다. 오프라인인 사람은 관전석으로 옮긴다.
  const sit = (seat: number) => {
    if (!me || me.team === seat) return
    for (const p of at(seat)) if (!p.online) void api.updatePlayerTeam(p.id, SEAT.watch)
    void api.updatePlayerTeam(playerId, seat)
  }

  const swap = () => {
    for (const p of at(SEAT.black)) void api.updatePlayerTeam(p.id, SEAT.white)
    for (const p of at(SEAT.white)) void api.updatePlayerTeam(p.id, SEAT.black)
  }

  const Tags = ({ p }: { p: PlayerInfo }) => (
    <>
      {p.id === hostId && <em className={styles.tag}>방장</em>}
      {p.id === playerId && <em className={`${styles.tag} ${styles.me}`}>나</em>}
    </>
  )

  return (
    <main className={styles.screen}>
      <Backdrop className={styles.backdrop} />

      <div className={styles.card}>
        <header className={styles.head}>
          <button className="btn ghost" onClick={onLeave}>
            ← 나가기
          </button>
          <button className={styles.roomCode} onClick={copy} title="초대 링크 복사">
            <small>방 코드</small>
            <strong>{code}</strong>
            <span>{copied ? '복사됨!' : '링크 복사'}</span>
          </button>
        </header>

        <section className={styles.settings}>
          <div className={styles.inline}>
            규칙
            <div className={styles.seg}>
              {(['renju', 'free'] as const).map((r) => (
                <button key={r} className={rule === r ? styles.on : ''} disabled={!isHost} onClick={() => api.setSettings({ rule: r })}>
                  {RULE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <p className={styles.ruleHint}>{RULE_HINT[rule]}</p>
        </section>

        <div className={styles.seats}>
          {[SEAT.black, SEAT.white].map((seat) => {
            const here = at(seat)
            const blocked = here.some((p) => p.online && p.id !== playerId)
            return (
              <button
                key={seat}
                className={`${styles.seat} ${here.length ? styles.taken : ''} ${me?.team === seat ? styles.mine : ''}`}
                disabled={blocked || !me || me.team === seat}
                onClick={() => sit(seat)}
              >
                <i className={`${styles.stone} ${seat === SEAT.black ? styles.black : styles.white}`} />
                <small>{seat === SEAT.black ? '흑 · 먼저 둬요' : '백'}</small>
                {here.length ? (
                  here.map((p) => (
                    <span key={p.id} className={`${styles.seatName} ${p.online ? '' : styles.off}`}>
                      {p.name}
                      <Tags p={p} />
                    </span>
                  ))
                ) : (
                  <span className={`${styles.seatName} ${styles.empty}`}>눌러서 앉기</span>
                )}
              </button>
            )
          })}
        </div>

        <div className={styles.watchers}>
          <span>관전</span>
          {watchers.length === 0 && <span>없음</span>}
          {watchers.map((p) => (
            <span key={p.id} className={`${styles.watcher} ${p.online ? '' : styles.off}`}>
              {p.name}
              <Tags p={p} />
            </span>
          ))}
          {me && me.team !== SEAT.watch && (
            <button className={styles.linkBtn} onClick={() => api.updatePlayerTeam(playerId, SEAT.watch)}>
              관전하기
            </button>
          )}
          {isHost && (
            <button className={styles.linkBtn} onClick={swap}>
              흑백 바꾸기
            </button>
          )}
        </div>

        {me && (
          <div className={`${styles.inline} ${styles.nameRow}`}>
            내 이름 <NameEditor name={me.name} onSave={onRename} />
          </div>
        )}
        {!me && players.length >= omok.maxPlayers && <p className="hint">방이 가득 찼어요</p>}

        {isHost ? (
          <button className="btn primary big" onClick={api.start}>
            게임 시작
          </button>
        ) : (
          <p className="waiting">방장이 시작하기를 기다리고 있어요…</p>
        )}
        {api.error && <p className="err">{api.error}</p>}
      </div>
    </main>
  )
}

/** 로비에서만 렌더링되므로 게임이 시작되면 이름은 고정된다. */
function NameEditor({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = () => {
    const next = draft.trim().slice(0, 10)
    if (next && next !== name) onSave(next)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        className={styles.nameBtn}
        title="이름 수정"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
      >
        {name} <span aria-hidden>✎</span>
      </button>
    )
  }
  return (
    <input
      className={styles.nameInput}
      value={draft}
      maxLength={10}
      autoFocus
      aria-label="내 이름"
      placeholder="이름을 입력해 주세요"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}
