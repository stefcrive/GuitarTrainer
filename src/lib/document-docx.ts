import { unzipSync, strFromU8 } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

// Text-only DOCX reading: no HTML injection, embedded objects, or external links.
export function readDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: file => file.name === 'word/document.xml' && file.originalSize < 20_000_000 })
  const body = files['word/document.xml']
  if (!body) throw new Error('DOCX body is missing or exceeds 20 MB.')
  const xml = strFromU8(body)
  if (/<!ENTITY\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid DOCX document XML.')
  type Node = Record<string, any>
  const nodes: Node[] = new XMLParser({ preserveOrder: true, ignoreAttributes: false }).parse(xml)
  const paragraphs: string[] = []
  function text(nodes: Node[]): string {
    return nodes.map(node => {
      if ('#text' in node) return String(node['#text'])
      if ('w:tab' in node) return '\t'
      if ('w:br' in node) return node[':@']?.['@_w:type'] === 'page' ? '\f' : '\n'
      return Object.entries(node).filter(([key, value]) => key !== ':@' && Array.isArray(value)).map(([, value]) => text(value as Node[])).join('')
    }).join('')
  }
  function walk(nodes: Node[]) {
    for (const node of nodes) {
      if (node['w:p']) {
        const paragraph = node['w:p'] as Node[]
        const properties = paragraph.find(item => item['w:pPr'])?.['w:pPr'] as Node[] | undefined
        const style = properties?.find(item => item['w:pStyle'])?.[':@']?.['@_w:val'] as string | undefined
        const heading = style?.match(/^Heading([1-6])$/i)
        paragraphs.push((heading ? '#'.repeat(Number(heading[1])) + ' ' : '') + text(paragraph.filter(item => !item['w:pPr'])))
      } else for (const [key, value] of Object.entries(node)) if (key !== ':@' && Array.isArray(value)) walk(value)
    }
  }
  walk(nodes)
  return paragraphs.join('\n')
}
