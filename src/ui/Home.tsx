import { useState } from 'react'
import { backend, makeRoomCode, playerId, saveName, savedName } from '../net'
import { StickLogo } from './StickLogo'

export function Home({ initialCode, onEnter }: { initialCode: string | null; onEnter: (name: string, code: string) => void }) {
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
    if (!trimmed) return setErr('이름부터 적어줘')
    setBusy(true)
    for (let i = 0; i < 5; i++) {
      const c = makeRoomCode()
      const ok = await backend.createRoom(c, {
        createdAt: Date.now(),
        hostId: playerId,
        settings: { teamMode: false, teamCount: 2, piecesPerTeam: 4 },
        game: null,
      })
      if (ok) return enter(c)
    }
    setBusy(false)
    setErr('방을 못 만들었어. 다시 해줘')
  }

  const join = () => {
    if (!trimmed) return setErr('이름부터 적어줘')
    const c = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{4}$/.test(c)) return setErr('방 코드는 4글자야')
    enter(c)
  }

  return (
    <main className="home">
      <div className="home-card">
        <StickLogo />
        <h1 className="title">
          슈퍼 <span>윷놀이</span>
        </h1>
        <p className="subtitle">친구들이랑 한 판!</p>

        <label className="field">
          <span>내 이름</span>
          <input
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
            {initialCode} 방 들어가기
          </button>
        ) : (
          <>
            <button className="btn primary big" onClick={create} disabled={busy}>
              {busy ? '만드는 중…' : '새 방 만들기'}
            </button>
            <div className="divider">
              <span>또는</span>
            </div>
            <div className="join-row">
              <input
                className="code-input"
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
        {backend.kind === 'local' && <p className="hint">로컬 모드: 같은 브라우저의 탭끼리만 연결돼</p>}
      </div>
    </main>
  )
}
