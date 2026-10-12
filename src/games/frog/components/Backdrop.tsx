import { FrogScene, type SceneSword } from '../scene/FrogScene'
import { SLOT_COLORS } from './colors'

// 몇 자루가 이미 꽂혀 있다. 개구리는 계속 떨고 있다.
const SWORDS: SceneSword[] = [2, 9, 13, 20].map((hole, i) => ({ hole, seq: i + 1, color: SLOT_COLORS[i] }))

/** 메뉴 카드 뒤에서 천천히 도는 흐릿한 통. */
export function Backdrop({ className }: { className?: string }) {
  return <FrogScene className={className} swords={SWORDS} last={null} mountSeq={99} aim={null} interactive={false} onPick={() => {}} quiet spin lite />
}
