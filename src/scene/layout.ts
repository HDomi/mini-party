import { NODE_POS } from '../game/board'
import { GOAL, HOME, type GameState, type Piece } from '../game/rules'

export const BOARD_SIZE = 12.6
export const BOARD_TOP = 0.5
export const TRAY_TOP = 0.22
export const PIECE_H = 0.3

export type Vec3 = [number, number, number]

/** 집 트레이는 보드 옆(가로 화면) 또는 위/아래(세로 화면)에 놓인다. */
export function trayCenter(team: number, teams: number, portrait: boolean): [number, number] {
  const side = team % 2
  const row = Math.floor(team / 2)
  const rows = Math.ceil(teams / 2)
  const offset = (row - (rows - 1) / 2) * (portrait ? 4.2 : 3.6)
  const edge = BOARD_SIZE / 2 + 2.2
  return portrait ? [offset, side ? edge : -edge] : [side ? edge : -edge, offset]
}

export function traySlot(team: number, teams: number, index: number, portrait: boolean): Vec3 {
  const [cx, cz] = trayCenter(team, teams, portrait)
  const col = index % 3
  const row = Math.floor(index / 3)
  return [cx + (col - 1) * 0.92, TRAY_TOP, cz + (row - 0.5) * 0.95]
}

export function nodePos(node: string, y = BOARD_TOP): Vec3 {
  const [x, z] = NODE_POS[node]
  return [x, y, z]
}

function pieceIndex(p: Piece): number {
  return Number(p.id.split('-')[1])
}

/** 지금 각 말이 놓여야 할 위치. 쌓인 말은 id 순서대로 위로 올라간다. */
export function restingPositions(s: GameState, portrait: boolean): Record<string, Vec3> {
  const out: Record<string, Vec3> = {}
  const byNode = new Map<string, Piece[]>()
  for (const p of s.pieces) {
    if (p.pos === HOME || p.pos === GOAL) {
      out[p.id] = traySlot(p.team, s.teams.length, pieceIndex(p), portrait)
      continue
    }
    const list = byNode.get(p.pos) ?? []
    list.push(p)
    byNode.set(p.pos, list)
  }
  for (const [node, list] of byNode) {
    list.sort((a, b) => a.id.localeCompare(b.id))
    list.forEach((p, i) => {
      out[p.id] = nodePos(node, BOARD_TOP + i * PIECE_H)
    })
  }
  return out
}
