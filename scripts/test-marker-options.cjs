const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { spawnSync } = require('node:child_process')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/marker-generation-options.ts')
const loaded = new Module(filename, module)
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename)
const { parseMarkerOptions, youtubeProcessorArgs } = loaded.exports

test('generation options validate presets, speed and prompt without interpreting shell characters', () => {
  assert.deepEqual(parseMarkerOptions(undefined), { preset: 'lessons', customPrompt: '', transcriptionMode: 'fast' })
  for (const preset of ['lessons', 'devices', 'repertoire']) {
    const customPrompt = 'Keep riffs together.\nPreserve `literal` $(text).'
    assert.equal(parseMarkerOptions({ preset, customPrompt }).customPrompt, customPrompt)
  }
  for (const value of [null, [], { preset: 'other' }, { customPrompt: 123 }, { customPrompt: 'a'.repeat(4001) },
    { customPrompt: 'text\0env' }, { transcriptionMode: 'unknown' }]) assert.throws(() => parseMarkerOptions(value))
})

test('hyphen-prefixed YouTube IDs and titles survive actual Python argparse', () => {
  const args = youtubeProcessorArgs({ videoId: '-abcdefghij', duration: 120, title: '-- A guitar lesson' }, 'result with spaces.json')
  const script = "import argparse,json; p=argparse.ArgumentParser(); p.add_argument('--video-id'); p.add_argument('--duration'); p.add_argument('--title'); p.add_argument('--output'); print(json.dumps(vars(p.parse_args())))"
  const result = spawnSync(process.platform === 'win32' ? 'py' : 'python3',
    [...(process.platform === 'win32' ? ['-3'] : []), '-B', '-c', script, ...args.slice(1)], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { video_id: '-abcdefghij', duration: '120', title: '-- A guitar lesson', output: 'result with spaces.json' })
})
