import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import { zipSync, strToU8 } from 'fflate'

const require = createRequire(import.meta.url)
const modules = new Map()
function load(relative) {
  if (modules.has(relative)) return modules.get(relative)
  const filename = fileURLToPath(new URL(`../src/${relative}.ts`, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const module = { exports: {} }
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(id => id.startsWith('@/') ? load(id.slice(2)) : require(id), module, module.exports)
  modules.set(relative, module.exports)
  return module.exports
}
const { parseMusicXml, readMusicXml, parseTextTab } = load('lib/document-score')
const { extractMarkerCandidates, mergeDocumentMarkers, markerFromCandidate } = load('lib/document-markers')
const { detectStaves } = load('lib/document-staves')
const { scanDocuments, saveDocumentState, loadDocumentState } = load('services/documents')
const { readDocxText } = load('lib/document-docx')
const { resolveScoreMeter, combineDocumentScores, metronomeBeats, scorePlayhead } = load('lib/document-score-timing')
const { readOmrLayout } = load('lib/document-omr-layout')
const wrap = content => `<?xml version="1.0"?><score-partwise version="4.0"><part id="P1">${content}</part></score-partwise>`
const attributes = '<attributes><divisions>6</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>'
const note = (step, duration, extra = '') => `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration></note>`

test('MusicXML preserves triplets, chords, rests, backup voices, and compound meter', () => {
  const score = parseMusicXml(wrap(`<measure number="1">${attributes}${note('C', 2)}${note('E', 2, '<chord/>')}${note('D', 2)}<note><rest/><duration>2</duration></note><backup><duration>6</duration></backup>${note('G', 18)}</measure>`))
  assert.equal(score.beats, 6); assert.equal(score.beatType, 8)
  assert.equal(score.notes.find(item => item.midi === 60).duration, 1 / 3)
  assert.equal(score.notes.find(item => item.midi === 64).start, 0)
  assert.equal(score.notes.find(item => item.midi === 62).start, 1 / 3)
  assert.equal(score.notes.find(item => item.midi === 67).start, 0)
  assert.equal(score.notes.find(item => item.midi === null).start, 2 / 3)
  assert.equal(score.measures[0].end, 3)
  assert.equal(score.reviewed, false)
})

test('MusicXML ties sustain, pickups stay short, and meter changes remain attached to measures', () => {
  const score = parseMusicXml(wrap(`<measure number="0" implicit="yes">${attributes}${note('C', 6, '<tie type="start"/>')}</measure><measure number="1"><attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note('C', 6, '<tie type="stop"/>')}${note('D', 12)}</measure>`))
  assert.equal(score.notes.length, 2)
  assert.equal(score.notes[0].duration, 2)
  assert.equal(score.measures[0].end, 1)
  assert.equal(score.measures[1].start, 1)
  assert.equal(score.measures[1].beatType, 4)
})

test('MusicXML honors explicit transposition and refuses to invent a missing meter', () => {
  const score = parseMusicXml(wrap(`<measure><attributes><divisions>1</divisions><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>${note('E', 1)}</measure>`))
  assert.equal(score.notes[0].midi, 52)
  assert.equal(score.beats, null)
  assert.ok(score.warnings.some(item => item.includes('No time signature')))
  assert.throws(() => parseMusicXml('<score-partwise><broken>'))
  assert.throws(() => parseMusicXml('<!ENTITY bad "bad">' + wrap('')))
})

test('Compressed MusicXML follows the container entry, not an unrelated XML file', () => {
  const xml = wrap(`<measure>${attributes}${note('C', 6)}</measure>`)
  const archive = zipSync({ 'unrelated.xml': strToU8('<unrelated/>'), 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score/score.musicxml"/></rootfiles></container>'), 'score/score.musicxml': strToU8(xml) })
  assert.equal(readMusicXml(archive), xml)
})

test('Notation excludes duplicate TAB parts and aligns incomplete simultaneous parts', () => {
  const xml = `<score-partwise><part id="P1"><measure>${attributes}${note('C', 6)}</measure><measure>${note('D', 6)}</measure></part><part id="P2"><measure>${attributes}${note('E', 24)}</measure><measure>${note('F', 6)}</measure></part><part id="P3"><measure>${attributes}<attributes><clef><sign>TAB</sign></clef></attributes>${note('G', 96)}</measure></part></score-partwise>`
  const score = parseMusicXml(xml)
  assert.equal(score.notes.length, 4)
  assert.equal(score.notes.find(item => item.midi === 62).start, 4)
  assert.equal(score.notes.find(item => item.midi === 65).start, 4)
})

test('Missing meter is explicitly assumed, inferred, or carried; padding does not stretch notes', () => {
  const draft = parseMusicXml(wrap(`<measure>${note('C', 1)}</measure><measure>${note('D', 2)}</measure>`))
  const assumed = resolveScoreMeter(draft, { beats: 4, beatType: 4 })
  assert.equal(assumed.meterSource, 'assumed'); assert.equal(assumed.beats, 4)
  assert.equal(assumed.notes[0].duration, 1); assert.equal(assumed.notes[1].start, 4)
  assert.equal(assumed.measures[1].end, 8)
  const carried = resolveScoreMeter(draft, { beats: 4, beatType: 4 }, { beats: 6, beatType: 8 })
  assert.equal(carried.meterSource, 'carried'); assert.equal(carried.beatType, 8)
  const inferred = resolveScoreMeter(parseMusicXml(wrap(`<measure>${note('C', 3)}</measure><measure>${note('D', 3)}</measure>`)), { beats: 4, beatType: 4 })
  assert.equal(inferred.meterSource, 'inferred'); assert.equal(inferred.beats, 3)
  const recognized = resolveScoreMeter(parseMusicXml(wrap(`<measure>${attributes}${note('C', 18)}</measure>`)), { beats: 4, beatType: 4 })
  assert.equal(recognized.meterSource, 'recognized'); assert.equal(recognized.beatType, 8)
})

test('Page merging keeps source positions and carries loop clicks across meter changes', () => {
  const first = parseMusicXml(wrap(`<measure>${attributes}${note('C', 18)}</measure>`))
  first.notes[0].position = { page: 1, x: 0.2, y: 0.1, height: 0.1, system: '1' }; first.sourcePages = [{ page: 1 }]
  const second = parseMusicXml(wrap(`<measure><attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>${note('D', 3)}</measure>`))
  second.notes[0].position = { page: 2, x: 0.3, y: 0.2, height: 0.1, system: '2' }; second.sourcePages = [{ page: 2 }]
  const merged = combineDocumentScores([first, second])
  assert.equal(merged.notes[1].start, 3); assert.equal(merged.notes[1].measure, 1)
  assert.equal(scorePlayhead(merged, 3.2).page, 2)
  assert.deepEqual(metronomeBeats(merged, 2.5, 5.2), [{ beat: 2.5, accent: false }, { beat: 3, accent: true }, { beat: 4, accent: false }, { beat: 5, accent: false }])
  assert.equal(merged.sourcePages.length, 2)
})

test('OMR geometry projects note offsets onto the correct staff', () => {
  const lines = [100, 110, 120, 130, 140].map(y => `<line><point x="20" y="${y}"/><point x="980" y="${y}"/></line>`).join('')
  const xml = `<sheet><picture width="1000" height="600"/><scale><interline main="10"/></scale><page><system id="1"><stack id="1" left="20"/><part id="1"><staff id="1" left="20"><lines>${lines}</lines></staff><measure id="1"/></part></system></page></sheet>`
  const locate = readOmrLayout(zipSync({ 'sheet#1/sheet#1.xml': strToU8(xml) }))
  const position = locate('P1', '1', 1, 180)
  assert.equal(position.x, 0.2); assert.equal(position.y, 80 / 600); assert.equal(position.height, 80 / 600)
  assert.equal(locate('P3', '1', 1, 180), undefined)
})

test('TOC offsets map printed pages to physical pages and generation preserves manual edits', () => {
  const candidates = extractMarkerCandidates('Contents\nFirst exercise .... 1\nChapter 2: Rhythm\nImpossible .... 999', 3, 30, 6)
  assert.equal(candidates.find(item => item.origin === 'index').page, 7)
  assert.equal(candidates.length, 2)
  const manual = { ...markerFromCandidate(candidates[0]), notes: 'Keep my notes', completionDegree: 65 }
  const merged = mergeDocumentMarkers([manual], candidates.map(markerFromCandidate))
  assert.equal(merged.length, 2)
  assert.equal(merged.find(item => item.id === manual.id).notes, 'Keep my notes')
  assert.equal(extractMarkerCandidates('3  3  3  3  3  3  3  2', 1, 30).length, 0)
})

test('DOCX reading preserves headings, paragraph order, and explicit page breaks as plain text', () => {
  const xml = '<w:document xmlns:w="example"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1</w:t></w:r></w:p><w:p><w:r><w:t>A &amp; B</w:t><w:tab/><w:t>12</w:t><w:br w:type="page"/><w:t>Next page</w:t></w:r></w:p></w:body></w:document>'
  assert.equal(readDocxText(zipSync({ 'word/document.xml': strToU8(xml) })), '# Chapter 1\nA & B\t12\fNext page')
  assert.throws(() => readDocxText(zipSync({ 'other.xml': strToU8(xml) })))
})

test('TAB drafts retain simultaneous strings and explicitly lack reliable rhythm', () => {
  const score = parseTextTab('e|--0--2--|\nB|--1-----|\nG|--------|\nD|--------|\nA|--------|\nE|--------|')
  assert.equal(score.notes.filter(item => item.start === 0).length, 2)
  assert.equal(score.notes.find(item => item.string === 1 && item.fret === 2).midi, 66)
  assert.equal(score.beats, null); assert.equal(score.reviewed, false)
  assert.ok(score.warnings[0].includes('unknown'))
})

test('Staff proposals distinguish five-line notation from six-line TAB and ignore blank pages', () => {
  const width = 500, height = 300, data = new Uint8ClampedArray(width * height * 4).fill(255)
  assert.equal(detectStaves({ width, height, data }).length, 0)
  for (const y of [40, 50, 60, 70, 80, 160, 170, 180, 190, 200, 210]) {
    for (let x = 25; x < 475; x++) { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
  }
  const result = detectStaves({ width, height, data })
  assert.deepEqual(result.map(staff => staff.kind), ['notation', 'tab'])
  assert.ok(result.every(staff => staff.region.x >= 0 && staff.region.y >= 0 && staff.region.y + staff.region.height <= 1))
})

test('An extra beam above a notation staff does not cause it to be masked as TAB', () => {
  const width = 500, height = 240, data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const y of [32, 39, 49, 58, 68, 78, 126, 141, 156, 170, 185, 199]) {
    for (let x = 25; x < 475; x++) { const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
  }
  assert.deepEqual(detectStaves({ width, height, data }).map(staff => staff.kind), ['notation', 'tab'])
})

test('Staff detection tolerates slightly rotated book scans', () => {
  const width = 800, height = 400, data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const baseline of [100, 115, 130, 145, 160]) {
    for (let x = 30; x < 770; x++) {
      const y = Math.round(baseline + Math.tan(Math.PI / 180) * (x - width / 2))
      for (let row = y; row <= y + 1; row++) { const i = (row * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0 }
    }
  }
  const found = detectStaves({ width, height, data })
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'notation')
})

test('A tightly cropped six-string staff is still detected', () => {
  const width = 600, height = 140, data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const y of [20, 40, 60, 80, 100, 120]) for (let x = 20; x < 580; x++) {
    const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0
  }
  const found = detectStaves({ width, height, data })
  assert.equal(found.length, 1)
  assert.equal(found[0].kind, 'tab')
})

function directory(name = 'root') {
  const entries = new Map()
  return { name, kind: 'directory', entries: async function* () { yield* entries },
    async getDirectoryHandle(name, options) { if (!entries.has(name)) { if (!options?.create) throw new DOMException('Missing', 'NotFoundError'); entries.set(name, directory(name)) } return entries.get(name) },
    async getFileHandle(name, options) {
      if (!entries.has(name)) {
        if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
        let content = ''
        entries.set(name, { name, kind: 'file', getFile: async () => new Blob([content]), createWritable: async () => ({ write: async value => { content = value }, close: async () => {}, abort: async () => {} }) })
      }
      return entries.get(name)
    }
  }
}

test('Document scanning is recursive, excludes sidecars, and supports cancellation', async () => {
  const root = directory()
  await root.getFileHandle('book.pdf', { create: true })
  await root.getFileHandle('track.mp3', { create: true })
  await (await root.getDirectoryHandle('lessons', { create: true })).getFileHandle('notes.md', { create: true })
  await (await root.getDirectoryHandle('.guitar-documents', { create: true })).getFileHandle('hidden.txt', { create: true })
  assert.deepEqual((await scanDocuments(root)).map(item => item.path), ['book.pdf', 'lessons/notes.md'])
  const abort = new AbortController(); abort.abort()
  await assert.rejects(() => scanDocuments(root, abort.signal), { name: 'AbortError' })
})

test('Markers survive reopening, remain scoped by relative path, and serialize rapid writes', async () => {
  const root = directory()
  assert.equal(await loadDocumentState(root, 'a/book.pdf'), null)
  const first = { version: 1, markers: [], page: 1, fingerprint: 'abc' }
  await Promise.all([saveDocumentState(root, 'a/book.pdf', first), saveDocumentState(root, 'a/book.pdf', { ...first, page: 5 })])
  assert.equal((await loadDocumentState(root, 'a/book.pdf')).page, 5)
  assert.equal(await loadDocumentState(root, 'b/book.pdf'), null)
})


test('A shorter first part cannot collapse later bars of another part to beat zero', () => {
  const xml = '<score-partwise><part id="P1"><measure number="1">' + attributes + note('C', 18) + '</measure></part><part id="P2"><measure number="1">' + attributes + note('E', 18) + '</measure><measure number="2">' + note('F', 18) + '</measure><measure number="3">' + note('G', 18) + '</measure></part></score-partwise>'
  const score = parseMusicXml(xml)
  assert.equal(score.measures.length, 3)
  assert.equal(score.notes.find(n => n.midi === 67).start, 6)
})

test('The initial playhead chooses the first printed staff at simultaneous starts', () => {
  const score = parseMusicXml(wrap('<measure>' + attributes + note('C', 18) + '</measure>'))
  const early = { page: 1, x: 0.1, y: 0.1, height: 0.1, system: 'first' }
  const late = { ...early, y: 0.8, system: 'sixth' }
  score.notes = [{ ...score.notes[0], position: early }, { ...score.notes[0], id: 'later', position: late }]
  assert.equal(scorePlayhead(score, 0).system, 'first')
})

test('A measure without notes uses its own source location instead of jumping ahead', () => {
  const score = parseMusicXml(wrap('<measure>' + attributes + note('C', 18) + '</measure><measure>' + note('D', 18) + '</measure>'))
  score.measures[0].position = { page: 1, x: 0.1, y: 0.1, height: 0.1, system: 'first' }
  score.notes[1].position = { page: 1, x: 0.1, y: 0.8, height: 0.1, system: 'later' }
  assert.equal(scorePlayhead(score, 0).system, 'first')
})


test('Sextuplets occupy exactly one beat per six sixteenth notes without double scaling', () => {
  const modification = '<type>16th</type><time-modification><actual-notes>6</actual-notes><normal-notes>4</normal-notes></time-modification>'
  const score = parseMusicXml(wrap('<measure><attributes><divisions>6</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' + Array.from({length:24}, () => note('C', 1, modification)).join('') + '</measure>'))
  assert.equal(score.notes.length, 24)
  assert.equal(score.notes[0].duration, 1/6)
  assert.ok(Math.abs(score.notes[6].start - 1) < 1e-8)
  assert.ok(Math.abs(score.notes[23].start + score.notes[23].duration - 4) < 1e-8)
  assert.deepEqual(score.notes[0].tuplet, {actual:6, normal:4})
})

test('Tuplet type and dots recover missing MusicXML duration, while explicit duration wins', () => {
  const extra = '<type>eighth</type><dot/><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'
  const score = parseMusicXml(wrap('<measure><note><pitch><step>C</step><octave>4</octave></pitch>' + extra + '</note></measure>'))
  assert.equal(score.notes[0].duration, 0.5)
})

test('Coverage rejects a successful transcription that silently omits the first staff', () => {
  const { missingNotationStaves } = load('lib/document-coverage')
  const staves = [100, 300].map(y => ({ kind: 'notation', lines: [y,y+10,y+20,y+30,y+40], slope:0 }))
  const note = y => ({midi:60, position:{y:(y-20)/500,height:80/500}})
  assert.deepEqual(missingNotationStaves(staves, [{ notes:[note(300)] }], 500), [1])
  assert.deepEqual(missingNotationStaves(staves, [{ notes:[note(100),note(300)] }], 500), [])
})


test('Guitar-system recovery retains vocal and guitar staves together and orders systems top to bottom', () => {
  const { notationSystemRegions } = load('services/document-notation')
  const width=500,height=700,data=new Uint8ClampedArray(width*height*4).fill(255)
  for(const [start,count] of [[60,5],[160,5],[260,6],[420,5],[520,6]]) for(let line=0;line<count;line++) for(let x=20;x<480;x++) {
    const i=((start+line*10)*width+x)*4;data[i]=data[i+1]=data[i+2]=0
  }
  const regions=notationSystemRegions({width,height,getContext:()=>({getImageData:()=>({width,height,data})})})
  assert.equal(regions.length,2)
  assert.ok(regions[0].y < 60/height)
  assert.ok(regions[0].y+regions[0].height > 200/height)
  assert.ok(regions[1].y > regions[0].y+regions[0].height)
})

test('A shorter beam aligned above five staff lines is not six-line TAB', () => {
  const width=500,height=160,data=new Uint8ClampedArray(width*height*4).fill(255)
  for(const y of [30,40,50,60,70,80]) for(let x=y===30?75:10;x<(y===30?425:490);x++) {
    const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0
  }
  assert.ok(detectStaves({width,height,data}).every(staff=>staff.kind==='notation'))
})


const visionFixture = () => ({ complete: true, warnings: [], bpm: 80, measures: [{ label: '1', beats: 4, beatType: 4, meterAssumed: false, length: 1920, system: 1, top: 0.1, bottom: 0.3, chords: [],
  notes: Array.from({length:24}, (_,i) => ({midi:60+i%3, start:i*80, duration:80, voice:1,x:0.1+i*0.03,actual:6,normal:4,tie:'none'})) }] })

test('GPT structured score converts through MusicXML preserving sextuplets and source positions', () => {
  const { visionScoreToMusicXml } = load('lib/document-vision-score')
  const score = visionScoreToMusicXml(visionFixture())
  assert.equal(score.source,'gpt-vision'); assert.equal(score.notes.length,24)
  assert.equal(score.notes[0].duration,1/6); assert.equal(score.notes[0].position.x,0.1)
  assert.ok(Math.abs(score.notes[23].start+score.notes[23].duration-4)<1e-8)
  assert.ok(score.musicXml.includes('<actual-notes>6</actual-notes>'))
  assert.equal(parseMusicXml(score.musicXml).notes.length,24)
})

test('GPT output validation rejects overflow, invalid pitches, and reversed systems', () => {
  const { visionScoreToMusicXml } = load('lib/document-vision-score')
  let score=visionFixture();score.measures[0].notes[0].duration=2000;assert.throws(()=>visionScoreToMusicXml(score))
  score=visionFixture();score.measures[0].notes[0].midi=200;assert.throws(()=>visionScoreToMusicXml(score))
  score=visionFixture();score.measures.push({...score.measures[0],system:0});assert.throws(()=>visionScoreToMusicXml(score))
  score=visionFixture();score.complete=false;score.warnings=['Opening note unclear'];assert.ok(visionScoreToMusicXml(score).warnings.some(w=>w.includes('incomplete')))
})

test('GPT request uses image input and strict schema; refusal and truncation fail without partial parsing', async () => {
  modules.set('lib/marker-generation-settings', { getMarkerGenerationEnv: async()=>({OPENAI_API_KEY:'test-key'}) })
  const { recognizeNotationWithGpt } = load('lib/document-vision')
  const original=globalThis.fetch
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.openai.com/v1/responses')
      const body=JSON.parse(options.body)
      assert.equal(body.model,'gpt-6-astra');assert.equal(body.store,false);assert.equal(body.text.format.strict,true)
      assert.equal(body.reasoning.effort,'low')
      assert.equal(body.input[0].content[1].type,'input_image')
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(visionFixture())}]}]}))
    }
    assert.equal((await recognizeNotationWithGpt(new Uint8Array([1,2]),new AbortController().signal))[0].notes.length,24)
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'incomplete',output:[]}))
    await assert.rejects(()=>recognizeNotationWithGpt(new Uint8Array([1]),new AbortController().signal),/finish/)
    globalThis.fetch=async()=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}))
    await assert.rejects(()=>recognizeNotationWithGpt(new Uint8Array([1]),new AbortController().signal),/declined/)
  } finally {globalThis.fetch=original}
})


test('Astra harmony stays separate, preserves evidence, and survives export and page merging', () => {
  const { visionScoreToMusicXml } = load('lib/document-vision-score')
  const { chordPitches, exportScoreMusicXml } = load('lib/document-chords')
  const raw = visionFixture()
  raw.measures[0].chords = [
    { name: 'A/C#', start: 0, duration: 960, midi: chordPitches('A/C#'), origin: 'symbol', confidence: 0.98, reason: 'Printed A/C# above the staff.' },
    { name: 'Dm7', start: 960, duration: 960, midi: chordPitches('Dm7'), origin: 'inferred', confidence: 0.65, reason: 'Strong-beat D and F support a minor predominant.' },
  ]
  const score = visionScoreToMusicXml(raw)
  assert.equal(score.notes.length, 24)
  assert.equal(score.chords[0].start, 0); assert.equal(score.chords[1].start, 2)
  assert.equal(score.chords[0].midi[0], 37)
  assert.equal(score.chords[1].origin, 'inferred')
  const combined = combineDocumentScores([score, score])
  assert.equal(combined.chords.length, 4)
  assert.equal(combined.chords[2].start, 4); assert.equal(combined.chords[2].measure, 1)
  const imported = parseMusicXml(exportScoreMusicXml(combined))
  assert.equal(imported.notes.length, 48)
  assert.equal(imported.chords.length, 4)
  assert.deepEqual(imported.chords.map(c => [c.name,c.start,c.duration,c.midi]), combined.chords.map(c => [c.name,c.start,c.duration,c.midi]))
  assert.equal(imported.chords[1].origin, 'inferred')
  assert.equal(imported.notes[0].duration, 1/6)
})

test('Harmony rejects invalid timing and pitches, with explicit silence and editable extended chords', () => {
  const { visionScoreToMusicXml } = load('lib/document-vision-score')
  const { chordPitches, validChordTrack, exportScoreMusicXml } = load('lib/document-chords')
  assert.deepEqual(chordPitches('Bbmaj7'), [58,62,65,69])
  assert.deepEqual(chordPitches('F#m7b5'), [54,57,60,64])
  assert.deepEqual(chordPitches('N.C.'), [])
  assert.equal(chordPitches('not a chord'), null)
  const raw=visionFixture()
  const chord={name:'C',start:0,duration:960,midi:[48,52,55],origin:'diagram',confidence:0.9,reason:'Open C diagram.'}
  raw.measures[0].chords=[chord]
  const score=visionScoreToMusicXml(raw)
  assert.equal(score.chords[0].origin,'diagram'); assert.ok(validChordTrack(score))
  raw.measures[0].chords=[{...chord,midi:[200]}]
  assert.throws(()=>visionScoreToMusicXml(raw))
  raw.measures[0].chords=[chord,{...chord,start:480}]
  assert.throws(()=>visionScoreToMusicXml(raw))
  score.chords.push({...score.chords[0],id:'silence',name:'N.C.',midi:[],start:2,duration:1})
  const imported=parseMusicXml(exportScoreMusicXml(score))
  assert.equal(imported.chords[1].duration,1); assert.deepEqual(imported.chords[1].midi,[])
  score.chords[1].duration=3
  assert.equal(validChordTrack(score),false)
})

const bookCatalog = load('services/marker-catalog')
test('Book catalog includes page markers and notation, preserves source data when practice updates progress', async () => {
  const root = directory()
  const lessons = await root.getDirectoryHandle('lessons', { create: true })
  await lessons.getFileHandle('book.pdf', { create: true })
  await lessons.getFileHandle('empty.pdf', { create: true })
  const score = parseMusicXml(wrap(`<measure>${attributes}${note('C', 6)}</measure>`))
  const marker = { id: 'notation-1', title: 'Triplet study', page: 4, endPage: 5, kind: 'notation', notes: 'Keep an even pulse.', tags: ['rhythm'], learning: { domain: 'training', topics: ['triplets'] }, score, region: { x: 0, y: 0, width: 1, height: 0.5 }, completionDegree: 10, origin: 'manual' }
  const saved = { version: 1, page: 2, fingerprint: 'book-v1', markers: [marker], ocrPages: { 4: 'Lesson 4' } }
  await saveDocumentState(root, 'lessons/book.pdf', saved)
  const items = await bookCatalog.loadBookMarkerCatalog(root)
  assert.equal(items.length, 1)
  const item = items[0]
  assert.equal(item.contentType, 'book')
  assert.equal(item.markerKey, 'lessons/book.pdf::notation-1')
  assert.equal(item.documentMarker.page, 4)
  assert.equal(item.documentMarker.endPage, 5)
  assert.deepEqual(item.tags, ['rhythm', 'triplets'])
  assert.equal(item.annotation.text, marker.notes)
  assert.equal(item.document.path, 'lessons/book.pdf')
  // An older catalog selection must not overwrite a newly assigned category.
  await saveDocumentState(root, 'lessons/book.pdf', { ...saved, markers: [{ ...marker, learning: { domain: 'repertoire' } }] })
  await bookCatalog.updateCatalogMarkerProgress(item, 73.6)
  let result = await loadDocumentState(root, 'lessons/book.pdf')
  assert.equal(result.markers[0].completionDegree, 74)
  assert.equal(result.markers[0].learning.domain, 'repertoire')
  assert.deepEqual(result.markers[0].score, JSON.parse(JSON.stringify(score)))
  assert.deepEqual(result.markers[0].region, marker.region)
  assert.deepEqual(result.ocrPages, saved.ocrPages)
  assert.equal(result.page, 2)
  await bookCatalog.updateCatalogMarkerLearning(item, { domain: 'musical-device' })
  result = await loadDocumentState(root, 'lessons/book.pdf')
  assert.equal(result.markers[0].completionDegree, 74)
  assert.equal(result.markers[0].learning.domain, 'musical-device')
  await saveDocumentState(root, 'lessons/book.pdf', { ...saved, markers: [] })
  await assert.rejects(() => bookCatalog.updateCatalogMarkerProgress(item, 100), /no longer exists/)
})
