const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/youtube-generated-markers.ts')
const loaded = new Module(filename, module)
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename)
const { mergeYouTubeGeneratedMarkers } = loaded.exports

test('regeneration replaces only this video generated markers and preserves manual work', () => {
  const manual = { id: 'manual', startTime: 10, endTime: 20, diagrams: ['user diagram'], completionDegree: 80 }
  const old = { id: 'gtm:youtube:abcdefghijk:0', startTime: 0, endTime: 10 }
  const note = { id: 'manual-note', markerId: 'manual', text: 'Keep me' }
  const current = { markers: [manual, old], annotations: [note, { markerId: old.id }], activeMarkerId: manual.id, isLooping: true }
  const generated = { markers: [{ ...old, title: 'New teaching unit' }], annotations: [{ markerId: old.id, text: 'New summary' }] }
  const result = mergeYouTubeGeneratedMarkers(current, generated, 'abcdefghijk')
  assert.equal(result.markers.length, 2)
  assert.equal(result.markers[1], manual)
  assert.equal(result.annotations[0], note)
  assert.equal(result.activeMarkerId, 'manual')
  assert.equal(result.isLooping, true)
  const repeated = mergeYouTubeGeneratedMarkers(result, generated, 'abcdefghijk')
  assert.deepEqual(repeated, result)
})
