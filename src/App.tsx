import { useEffect, useState } from 'react'
import { Home } from './ui/Home'
import { Room } from './ui/Room'
import { saveName, savedName } from './net'

function codeFromHash(): string | null {
  const m = location.hash.match(/^#\/([A-Z0-9]{4})$/i)
  return m ? m[1].toUpperCase() : null
}

export default function App() {
  const [code, setCode] = useState(codeFromHash)
  const [name, setName] = useState(savedName)

  useEffect(() => {
    const onHash = () => setCode(codeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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
    />
  )
}
