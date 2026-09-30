// 윷판 그래프: 바깥 칸 20개 + 중앙에서 교차하는 대각선 2개 (총 29칸).
//
//   O10 O9  O8  O7  O6  O5
//   O11 L1              R1  O4
//   O12     L2      R2      O3
//               C
//   O13     F1      E1      O2
//   O14 F2              E2  O1
//   O15 O16 O17 O18 O19 O0   <- O0 이 출발/도착 지점 (참먹이)
//
// 말은 반시계 방향으로 움직인다. O5 / O10 / C 에 멈추면 지름길로 간다.

export type NodeId = string

export const BOARD_HALF = 5

export const NODE_POS: Record<NodeId, [number, number]> = (() => {
  const pos: Record<NodeId, [number, number]> = {}
  const h = BOARD_HALF
  const step = (2 * h) / 5
  for (let i = 0; i < 20; i++) {
    const side = Math.floor(i / 5)
    const k = i % 5
    let x = 0
    let z = 0
    if (side === 0) [x, z] = [h, h - k * step]
    else if (side === 1) [x, z] = [h - k * step, -h]
    else if (side === 2) [x, z] = [-h, -h + k * step]
    else [x, z] = [-h + k * step, h]
    pos[`O${i}`] = [x, z]
  }
  const d = h / 3
  pos.R1 = [2 * d, -2 * d]
  pos.R2 = [d, -d]
  pos.L1 = [-2 * d, -2 * d]
  pos.L2 = [-d, -d]
  pos.C = [0, 0]
  pos.E1 = [d, d]
  pos.E2 = [2 * d, 2 * d]
  pos.F1 = [-d, d]
  pos.F2 = [-2 * d, 2 * d]
  return pos
})()

export const ALL_NODES = Object.keys(NODE_POS)

export const BIG_NODES = new Set(['O0', 'O5', 'O10', 'O15', 'C'])

export const EDGES: [NodeId, NodeId][] = (() => {
  const e: [NodeId, NodeId][] = []
  for (let i = 0; i < 20; i++) e.push([`O${i}`, `O${(i + 1) % 20}`])
  e.push(['O5', 'R1'], ['R1', 'R2'], ['R2', 'C'], ['C', 'F1'], ['F1', 'F2'], ['F2', 'O15'])
  e.push(['O10', 'L1'], ['L1', 'L2'], ['L2', 'C'], ['C', 'E1'], ['E1', 'E2'], ['E2', 'O0'])
  return e
})()

const LINEAR_NEXT: Record<NodeId, NodeId> = {
  R1: 'R2',
  R2: 'C',
  L1: 'L2',
  L2: 'C',
  F1: 'F2',
  F2: 'O15',
  E1: 'E2',
  E2: 'O0',
}

/** 한 칸 앞으로 갈 때의 다음 칸. `first` = 이번 이동의 첫 걸음인지 여부. */
export function nextNode(cur: NodeId, prev: NodeId | undefined, first: boolean): NodeId {
  if (first) {
    if (cur === 'O5') return 'R1'
    if (cur === 'O10') return 'L1'
    if (cur === 'C') return 'E1'
  }
  if (cur === 'C') return prev === 'L2' ? 'E1' : 'F1'
  if (LINEAR_NEXT[cur]) return LINEAR_NEXT[cur]
  const i = Number(cur.slice(1))
  return `O${(i + 1) % 20}`
}

/** 말에 기록된 trail 이 없을 때의 빽도 대체 처리. */
export function defaultPrev(cur: NodeId): NodeId {
  const map: Record<NodeId, NodeId> = {
    R1: 'O5',
    R2: 'R1',
    L1: 'O10',
    L2: 'L1',
    C: 'R2',
    F1: 'C',
    F2: 'F1',
    E1: 'C',
    E2: 'E1',
  }
  if (map[cur]) return map[cur]
  const i = Number(cur.slice(1))
  return `O${(i + 19) % 20}`
}
