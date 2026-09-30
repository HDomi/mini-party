import { useState } from 'react'
import { saveName, savedName } from '@/net'
import { navigate } from '@/router'
import { Home } from './components/Home'
import { Room } from './components/Room'
import { Solo } from './components/Solo'
import { omokPath } from './paths'

export function OmokApp({ sub }: { sub: string }) {
  const code = /^[A-Z0-9]{4}$/i.test(sub) ? sub.toUpperCase() : null
  const solo = sub === 'bot'
  const [name, setName] = useState(savedName)
  const toHome = () => navigate(omokPath())

  if (solo && name) return <Solo name={name} onLeave={toHome} />
  if (code && name) {
    return (
      <Room
        code={code}
        name={name}
        onLeave={toHome}
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
        navigate(omokPath(nextCode))
      }}
      onSolo={(nextName) => {
        setName(nextName)
        navigate(omokPath('bot'))
      }}
    />
  )
}
