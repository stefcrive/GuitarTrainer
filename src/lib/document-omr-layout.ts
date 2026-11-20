import { XMLParser } from 'fast-xml-parser'
import { strFromU8, unzipSync } from 'fflate'
import type { ScorePosition } from '@/types/document'

type Node = Record<string, any>
const list = (value: any): Node[] => value === undefined ? [] : Array.isArray(value) ? value : [value]

export type ScoreLocator = (part: string, measure: string, staff: number, x: number, ordinal?: number) => ScorePosition | undefined

// Audiveris exports note x offsets in MusicXML, and exact staff geometry in its OMR archive.
// Use those coordinates rather than distributing notes evenly across an image.
export function readOmrLayout(bytes: Uint8Array): ScoreLocator {
  const files = unzipSync(bytes, { filter: entry => /sheet#\d+\.xml$/.test(entry.name) && entry.originalSize < 30_000_000 })
  const locations = new Map<string, { width: number; height: number; interline: number; left: number; system: string; lines: Node[] }>()
  const ordinals = new Map<string, number>()
  for (const [name, bytes] of Object.entries(files)) {
    const sheet = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(strFromU8(bytes)).sheet
    if (!sheet) continue
    const width = Number(sheet.picture?.['@_width']), height = Number(sheet.picture?.['@_height'])
    const interline = Number(sheet.scale?.interline?.['@_main'])
    if (!(width > 0 && height > 0 && interline > 0)) continue
    for (const page of list(sheet.page)) for (const system of list(page.system)) {
      const stacks = list(system.stack)
      for (const part of list(system.part)) {
        const measures = list(part.measure)
        const partKey = `P${part['@_id']}`
        const base = ordinals.get(partKey) ?? 0
        for (const [index, measure] of measures.entries()) for (const [staffIndex, staff] of list(part.staff).entries()) {
          const lines = list(staff.lines?.line)
          if (lines.length !== 5) continue
          const location = {
            width, height, interline, left: Number(stacks[index]?.['@_left'] ?? staff['@_left']),
            system: `${name}:${system['@_id']}:${staff['@_id']}`, lines,
          }
          locations.set(`${partKey}:ordinal-${base + index}:${staffIndex + 1}`, location)
          // Labels can restart in another system. Never overwrite an earlier bar.
          const key = `${partKey}:${measure['@_id']}:${staffIndex + 1}`
          if (!locations.has(key)) locations.set(key, location)
        }
        ordinals.set(partKey, base + measures.length)
      }
    }
  }
  return (part, measure, staff, offset, ordinal) => {
    const location = locations.get(`${part}:${ordinal === undefined ? measure : `ordinal-${ordinal}`}:${staff}`)
    if (!location || !Number.isFinite(offset)) return undefined
    const { width, height, interline, left, system, lines } = location
    const x = left + offset * interline / 10
    const yAt = (line: Node) => {
      const points = list(line.point)
      const a = points.findLast(point => Number(point['@_x']) <= x) ?? points[0]
      const b = points.find(point => Number(point['@_x']) > x) ?? points.at(-1)
      if (!a || !b) return NaN
      const ratio = Math.max(0, Math.min(1, (x - Number(a['@_x'])) / (Number(b['@_x']) - Number(a['@_x']) || 1)))
      return Number(a['@_y']) + ratio * (Number(b['@_y']) - Number(a['@_y']))
    }
    const top = yAt(lines[0]), bottom = yAt(lines[4]), gap = (bottom - top) / 4
    if (!Number.isFinite(top + bottom + x)) return undefined
    return { page: 1, x: x / width, y: Math.max(0, top - gap * 2) / height, height: gap * 8 / height, system }
  }
}
