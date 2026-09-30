import { useEffect, useState } from 'react'
import { Home } from './ui/Home'
import { Room } from './ui/Room'
import { Solo } from './ui/Solo'
import { VolumeControl } from './ui/VolumeControl'
import { saveName, savedName } from './net'

function codeFromHash(): string | null {
  const m = location.hash.match(/^#\/([A-Z0-9]{4})$/i)
  return m ? m[1].toUpperCase() : null
}

/** 1인 플레이 경로. 방 코드가 아니므로(코드는 정확히 네 글자) 방 코드와 겹칠 일이 없다. */
const SOLO_HASH = '#/bot'
const soloFromHash = () => location.hash === SOLO_HASH

export default function App() {
  return (
    <>
      <Screen />
      <VolumeControl />
    </>
  )
}

function Screen() {
  const [code, setCode] = useState(codeFromHash)
  const [solo, setSolo] = useState(soloFromHash)
  const [name, setName] = useState(savedName)

  useEffect(() => {
    const onHash = () => {
      setCode(codeFromHash())
      setSolo(soloFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (solo && name) return <Solo name={name} onLeave={() => (location.hash = '')} />
  if (code && name) {
    return (
      <Room
        code={code}
        name={name}
        onLeave={() => (location.hash = '')}
        onRename={(next) => {
          saveName(next)
          setName(next)
        }}
      />
    )
  }
  return (
    <Home
      initialCode={code}
      onEnter={(nextName, nextCode) => {
        setName(nextName)
        location.hash = `/${nextCode}`
        setCode(nextCode)
      }}
      onSolo={(nextName) => {
        setName(nextName)
        location.hash = SOLO_HASH.slice(1)
        setSolo(true)
      }}
    />
  )
}
