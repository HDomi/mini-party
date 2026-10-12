import { useState } from 'react'
import { playerId, type PlayerInfo } from '@/net'
import { absoluteUrl } from '@/router'
import { MAX_PLAYERS } from '../game/rules'
import { frogPath } from '../paths'
import { frog, WATCH, type FrogRoomApi } from '../room'
import { Backdrop } from './Backdrop'
import { SLOT_COLORS, SLOT_NAMES } from './colors'
import styles from './Menu.module.scss'

export function Lobby({
  code,
  api,
  onLeave,
  onRename,
}: {
  code: string
  api: FrogRoomApi
  onLeave: () => void
  onRename: (name: string) => void
}) {
  const { room, players, hostId, me } = api
  const [copied, setCopied] = useState(false)
  if (!room) return null
  const isHost = hostId === playerId
  const link = absoluteUrl(frogPath(code))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      api.flash('복사하지 못했어요. 주소창의 링크를 보내 주세요')
    }
  }

  const at = (slot: number) => players.filter((p) => p.team === slot)
  const watchers = players.filter((p) => p.team >= MAX_PLAYERS)

  // 빈 자리이거나 오프라인인 사람만 있는 자리에 앉는다. 오프라인인 사람은 관전석으로 옮긴다.
  const sit = (slot: number) => {
    if (!me || me.team === slot) return
    for (const p of at(slot)) if (!p.online) void api.updatePlayerTeam(p.id, WATCH)
    void api.updatePlayerTeam(playerId, slot)
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

        <section className={styles.rules}>
          <p>돌아가면서 통 구멍 하나를 골라 칼을 꽂아요.</p>
          <p>개구리가 펑! 튀어나오게 만든 사람이 당첨이에요.</p>
        </section>

        <div className={styles.seats}>
          {Array.from({ length: MAX_PLAYERS }, (_, slot) => {
            const here = at(slot)
            const blocked = here.some((p) => p.online && p.id !== playerId)
            return (
              <button
                key={slot}
                className={`${styles.seat} ${here.length ? styles.taken : ''} ${me?.team === slot ? styles.mine : ''}`}
                disabled={blocked || !me || me.team === slot}
                onClick={() => sit(slot)}
              >
                <i className={styles.swatch} style={{ background: SLOT_COLORS[slot] }} />
                <small>{SLOT_NAMES[slot]} 칼</small>
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
          {me && me.team < MAX_PLAYERS && (
            <button className={styles.linkBtn} onClick={() => api.updatePlayerTeam(playerId, WATCH)}>
              관전하기
            </button>
          )}
        </div>

        {me && (
          <div className={`${styles.inline} ${styles.nameRow}`}>
            내 이름 <NameEditor name={me.name} onSave={onRename} />
          </div>
        )}
        {!me && players.length >= frog.maxPlayers && <p className="hint">방이 가득 찼어요</p>}

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
