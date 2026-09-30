import { useState } from 'react'
import { saveName, savedName } from '@/net'
import { navigate } from '@/router'
import { Home } from './components/Home'
import { Room } from './components/Room'
import { Solo } from './components/Solo'
import { yutPath } from './paths'
import './styles/index.scss'

export function YutnoriApp({ sub }: { sub: string }) {
  const code = /^[A-Z0-9]{4}$/i.test(sub) ? sub.toUpperCase() : null
  const solo = sub === 'bot'
  const [name, setName] = useState(savedName)
  const toHome = () => navigate(yutPath())

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
        navigate(yutPath(nextCode))
      }}
      onSolo={(nextName) => {
        setName(nextName)
        navigate(yutPath('bot'))
      }}
    />
  )
}
