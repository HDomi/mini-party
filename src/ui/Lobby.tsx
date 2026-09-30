import { useState, type CSSProperties } from 'react'
import { TEAM_COLORS, TEAM_NAMES } from '../game/rules'
import { playerId } from '../net'
import type { RoomApi } from '../net/useRoom'
import { Backdrop } from './Backdrop'

export function Lobby({
  code,
  api,
  onLeave,
  onRename,
}: {
  code: string
  api: RoomApi
  onLeave: () => void
  onRename: (name: string) => void
}) {
  const { room, players, hostId } = api
  const [copied, setCopied] = useState(false)
  if (!room) return null
  const s = room.settings
  const isHost = hostId === playerId
  const link = `${location.origin}${location.pathname}#/${code}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      api.flash('복사하지 못했어요. 주소창의 링크를 보내 주세요')
    }
  }

  const teamOf = (team: number) => (s.teamMode ? team % s.teamCount : null)

  return (
    <main className="lobby">
      <Backdrop />

      <div className="lobby-card">
        <header className="lobby-head">
          <button className="btn ghost" onClick={onLeave}>
            ← 나가기
          </button>
          <div className="room-code" onClick={copy} title="초대 링크 복사">
            <small>방 코드</small>
            <strong>{code}</strong>
            <span>{copied ? '복사됨!' : '링크 복사'}</span>
          </div>
        </header>

        <section className="settings">
          <div className="seg">
            <button className={!s.teamMode ? 'on' : ''} disabled={!isHost} onClick={() => api.setSettings({ teamMode: false })}>
              개인전
            </button>
            <button className={s.teamMode ? 'on' : ''} disabled={!isHost} onClick={() => api.setSettings({ teamMode: true })}>
              팀전
            </button>
          </div>
          {s.teamMode && (
            <label className="inline">
              팀 수
              <div className="seg small">
                {[2, 3].map((n) => (
                  <button key={n} className={s.teamCount === n ? 'on' : ''} disabled={!isHost} onClick={() => api.setSettings({ teamCount: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </label>
          )}
          <label className="inline">
            말 개수
            <div className="seg small">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={s.piecesPerTeam === n ? 'on' : ''}
                  disabled={!isHost}
                  onClick={() => api.setSettings({ piecesPerTeam: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </label>
        </section>

        <ul className="players">
          {players.map((p) => {
            const t = teamOf(p.team)
            const mine = p.id === playerId
            return (
              <li key={p.id} className={`${p.online ? '' : 'off'}${mine ? ' me' : ''}`}>
                <i className="dot" style={{ background: t === null ? '#c7b299' : TEAM_COLORS[t] }} />
                <span className="pname">
                  {mine ? <NameEditor name={p.name} onSave={onRename} /> : p.name}
                  {p.id === hostId && <em className="crown">방장</em>}
                  {mine && <em className="you">나</em>}
                </span>
                {t !== null && (
                  <div className="team-pick">
                    {Array.from({ length: s.teamCount }, (_, k) => (
                      <button
                        key={k}
                        className={t === k ? 'on' : ''}
                        style={{ '--team': TEAM_COLORS[k] } as CSSProperties}
                        disabled={!mine && !isHost}
                        onClick={() => api.updatePlayerTeam(p.id, k)}
                      >
                        {TEAM_NAMES[k]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
          {Array.from({ length: Math.max(0, 2 - players.length) }, (_, i) => (
            <li key={`empty-${i}`} className="empty">
              친구를 기다리고 있어요…
            </li>
          ))}
        </ul>
        <p className="count">{players.filter((p) => p.online).length} / 6명</p>

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

/** 내 행의 인라인 이름 변경. 로비에서만 렌더링되므로 게임이 시작되면 이름은 고정된다. */
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
        className="name-btn"
        title="이름 수정"
        onClick={() => {
          setDraft(name)
          setEditing(true)
        }}
      >
        {name}
        <span aria-hidden>✎</span>
      </button>
    )
  }
  return (
    <input
      className="name-input"
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
