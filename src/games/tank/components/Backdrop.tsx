import { useMemo } from 'react'
import { createGame } from '../game/rules'
import { Battlefield } from '../scene/Battlefield'

/** 메뉴 카드 뒤에 깔리는 전장. 구름만 흘러간다. */
export function Backdrop({ className }: { className?: string }) {
  const game = useMemo(
    () =>
      createGame({
        players: [
          { id: 'a', name: '', slot: 0 },
          { id: 'b', name: '', slot: 1 },
          { id: 'c', name: '', slot: 2 },
        ],
        teamMode: false,
        seed: 20260930,
      }),
    [],
  )
  return <Battlefield className={className} game={game} labels={false} sound={false} />
}
