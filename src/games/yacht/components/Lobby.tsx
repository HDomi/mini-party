import { useState } from 'react'
import { playerId, type PlayerInfo } from '@/net'
import { absoluteUrl } from '@/router'
import { MAX_PLAYERS } from '../game/rules'
import { yachtPath } from '../paths'
import { SEAT, yacht, type YachtRoomApi } from '../room'
import { Backdrop } from './Backdrop'
import { PLAYER_COLORS } from './colors'
import styles from './Menu.module.scss'

export function Lobby({
  code,
  api,
  onLeave,
  onRename,
}: {
  code: string
  api: YachtRoomApi
  onLeave: () => void
  onRename: (name: string) => void
}) {
  const { room, players, hostId, me } = api
  const [copied, setCopied] = useState(false)
  if (!room) return null
  const isHost = hostId === playerId
  const link = absoluteUrl(yachtPath(code))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      api.flash('복사하지 못했어요. 주소창의 링크를 보내 주세요')
    }
  }

  const playing = players.filter((p) => p.team === SEAT.play)
  const watchers = players.filter((p) => p.team !== SEAT.play)
  // 오프라인인 사람은 자리를 차지하지 않는다. 시작할 때도 온라인인 사람만 참가한다.
  const full = playing.filter((p) => p.online).length >= MAX_PLAYERS

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

        <section className={styles.rules}>
          <p>차례마다 주사위 다섯 개를 세 번까지 굴려요. 남길 주사위는 눌러서 잡아요.</p>
          <p>빈 족보 하나에 점수를 적고, 12칸을 다 채웠을 때 합계가 가장 높으면 이겨요.</p>
        </section>

        <div className={styles.seats}>
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = playing[i]
            return (
              <div key={p?.id ?? `empty${i}`} className={`${styles.seat} ${p ? styles.taken : ''} ${p?.id === playerId ? styles.mine : ''}`}>
                <i className={styles.swatch} style={{ background: p ? PLAYER_COLORS[i] : 'transparent' }} />
                {p ? (
                  <span className={`${styles.seatName} ${p.online ? '' : styles.off}`}>
                    {p.name}
                    <Tags p={p} />
                  </span>
                ) : (
                  <span className={`${styles.seatName} ${styles.empty}`}>빈 자리</span>
                )}
              </div>
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
          {me && me.team === SEAT.play && (
            <button className={styles.linkBtn} onClick={() => api.updatePlayerTeam(playerId, SEAT.watch)}>
              관전하기
            </button>
          )}
          {me && me.team !== SEAT.play && (
            <button className={styles.linkBtn} disabled={full} onClick={() => api.updatePlayerTeam(playerId, SEAT.play)}>
              {full ? '자리가 다 찼어요' : '참가하기'}
            </button>
          )}
        </div>

        {me && (
          <div className={`${styles.inline} ${styles.nameRow}`}>
            내 이름 <NameEditor name={me.name} onSave={onRename} />
          </div>
        )}
        {!me && players.length >= yacht.maxPlayers && <p className="hint">방이 가득 찼어요</p>}

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
