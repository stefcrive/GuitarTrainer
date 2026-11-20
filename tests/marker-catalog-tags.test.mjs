import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

test('catalog uses explicit tags for local, YouTube, and audio markers without promoting learning metadata', async () => {
  const learning = { topics: ['thirds in D'], primaryDomain: 'Harmony & Voice Leading', weeklyPracticeRole: 'Repertoire Support' }
  const marker = { id: 'm1', title: 'Target thirds', startTime: 0, endTime: 60, learning }
  const annotations = [{ markerId: 'm1', tags: ['chord tones', ' my custom tag ', 'chord tones'], text: 'Apply thirds' }]
  const dependencies = {
    '@/services/markers': { markersService: { loadAllMarkers: async () => [
      { contentPath: 'lesson.mp4', contentType: 'local', markerState: { markers: [marker], annotations } },
      { contentPath: 'youtube:abcdefghijk', contentType: 'youtube', markerState: { markers: [marker], annotations } },
      { contentPath: 'untagged.mp4', contentType: 'local', markerState: { markers: [marker], annotations: [] } }
    ] } },
    '@/services/audio-metadata': { getAllAudioMetadata: async () => ({
      'audio.mp3': { path: 'audio.mp3', markers: [marker], annotations }
    }) },
    '@/services/documents': {}
  }
  const source = readFileSync(new URL('../src/services/marker-catalog.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  })
  const module = { exports: {} }
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`)((id) => {
    assert.ok(id in dependencies, `Unexpected dependency: ${id}`)
    return dependencies[id]
  }, module, module.exports)
  const items = await module.exports.loadMarkerCatalog({ rootHandle: {}, includeDocuments: false })
  assert.equal(items.length, 4)
  for (const item of items) {
    assert.deepEqual(item.tags, item.contentPath === 'untagged.mp4' ? [] : ['chord tones', 'my custom tag'])
    assert.deepEqual(item.marker.learning.topics, ['thirds in D'])
  }
})
