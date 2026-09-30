import { useEffect } from 'react'
import { VolumeControl } from '@/components/VolumeControl'
import { gameBySlug } from '@/games/registry'
import { HomePage } from '@/pages/HomePage'
import { navigate, usePath } from '@/router'

export default function App() {
  return (
    <>
      <Screen />
      <VolumeControl />
    </>
  )
}

function Screen() {
  const path = usePath()
  const [, slug = '', ...rest] = path.split('/')
  const game = gameBySlug(slug)

  const unknown = slug !== '' && !game
  useEffect(() => {
    if (unknown) navigate('/', { replace: true })
  }, [unknown])

  if (game?.App) return <game.App key={game.id} sub={rest.join('/')} />
  return <HomePage />
}
