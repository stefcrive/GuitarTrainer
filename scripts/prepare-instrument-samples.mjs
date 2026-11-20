import { mkdir, writeFile } from 'node:fs/promises'

// Parse the soundfont data as JSON; never execute downloaded JavaScript.
const base = 'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/'
await mkdir('public/sounds', { recursive: true })
for (const name of ['acoustic_guitar_nylon', 'acoustic_guitar_steel', 'acoustic_grand_piano', 'electric_piano_1']) {
  const response = await fetch(`${base}${name}-mp3.js`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const source = await response.text()
  const data = JSON.parse(source.slice(source.indexOf('{', source.indexOf('= ', source.indexOf('MIDI.Soundfont.'))), source.lastIndexOf('}') + 1).replace(/,\s*}/g, '}'))
  await writeFile(`public/sounds/${name}.json`, JSON.stringify(data))
  console.log(`Saved ${name}: ${Object.keys(data).length} samples`)
}
