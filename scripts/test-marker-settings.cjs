const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')
const ts = require('typescript')
const { NextRequest } = require('next/server')

async function loadTypeScript(relativePath, overrides = {}) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const code = ts.transpileModule(await fs.readFile(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded.require = request => overrides[request] ?? Module.prototype.require.call(loaded, request)
  loaded._compile(code, filename)
  return loaded.exports
}

test('server-side marker settings preserve secrets, unrelated config, and enforce same-origin writes', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'guitar-marker-settings-test-'))
  const file = path.join(folder, '.env.local')
  const previous = process.env.GUITAR_TRAINER_SETTINGS_ENV
  process.env.GUITAR_TRAINER_SETTINGS_ENV = file
  try {
    await fs.writeFile(file, '# Existing configuration\nUNRELATED=keep-me\nOPENAI_API_KEY=old-test-value\nTYPESAFE_API_KEY=\n')
    const settings = await loadTypeScript('src/lib/marker-generation-settings.ts')
    const route = await loadTypeScript('src/app/api/marker-generation-settings/route.ts', {
      '@/lib/marker-generation-settings': settings
    })
    const request = (body, origin = 'http://localhost:3000') => new NextRequest('http://localhost:3000/api/marker-generation-settings', {
      method: 'POST', headers: { host: 'localhost:3000', origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    const save = await route.POST(request({ provider: 'jev', jevApiKey: 'jev-test-value' }))
    assert.equal(save.status, 200)
    assert.deepEqual(await save.json(), { provider: 'jev', jevConfigured: true, openaiConfigured: true })
    const env = await settings.getMarkerGenerationEnv()
    assert.equal(env.TYPESAFE_API_KEY, 'jev-test-value')
    assert.equal(env.OPENAI_API_KEY, 'old-test-value')
    assert.match(await fs.readFile(file, 'utf8'), /UNRELATED=keep-me/)

    const get = await route.GET()
    const response = await get.text()
    assert.ok(!response.includes('test-value'))
    assert.equal(get.headers.get('cache-control'), 'no-store')
    assert.equal((await route.POST(request({ provider: 'jev', jevApiKey: 'hijacked' }, 'https://untrusted.example'))).status, 403)
    assert.equal((await route.POST(request({ provider: 'jev' }, 'invalid-origin'))).status, 403)
    assert.equal((await route.POST(request({ provider: 'jev', jevApiKey: 'bad\nINJECTED=value' }))).status, 400)
    assert.equal((await route.POST(request({ provider: 'unsupported' }))).status, 400)
    assert.equal((await settings.getMarkerGenerationEnv()).TYPESAFE_API_KEY, 'jev-test-value')

    await route.POST(request({ provider: 'llm', jevApiKey: '' }))
    assert.deepEqual(await settings.getMarkerGenerationSettings(), { provider: 'llm', jevConfigured: false, openaiConfigured: true })
    // Repeated saves replace a key instead of accumulating duplicate env entries.
    await settings.saveMarkerGenerationSettings({ provider: 'llm', openaiApiKey: 'updated-test-value' })
    const saved = await fs.readFile(file, 'utf8')
    assert.equal((saved.match(/^OPENAI_API_KEY=/gm) || []).length, 1)
    assert.ok(!saved.includes('old-test-value'))
  } finally {
    if (previous === undefined) delete process.env.GUITAR_TRAINER_SETTINGS_ENV
    else process.env.GUITAR_TRAINER_SETTINGS_ENV = previous
    // Only remove the two named test files; never recursively delete a computed directory.
    await fs.unlink(file).catch(() => {})
    await fs.unlink(`${file}.tmp`).catch(() => {})
    await fs.rmdir(folder)
  }
})
