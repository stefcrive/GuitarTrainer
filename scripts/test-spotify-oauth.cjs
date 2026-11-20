const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { NextRequest } = require('next/server')

function load(relativePath, overrides = {}) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded.require = name => overrides[name] ?? Module.prototype.require.call(loaded, name)
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename)
  return loaded.exports
}

function request(url, cookie = '') {
  const parsed = new URL(url)
  // Match Next's incoming headers; NextURL itself normalizes loopback hosts.
  return new NextRequest(url, { headers: {
    'x-forwarded-host': parsed.host,
    'x-forwarded-proto': parsed.protocol.slice(0, -1),
    cookie
  } })
}

test('Spotify uses a loopback callback and keeps state and token exchange on the same host', async () => {
  const keys = ['NEXT_PUBLIC_SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_OAUTH_REDIRECT_URI']
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const originalFetch = global.fetch
  try {
    process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID = 'test-client'
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
    const helper = load('src/lib/spotify-oauth.ts')
    const overrides = { '@/lib/spotify-oauth': helper }
    const auth = load('src/app/api/spotify/auth/route.ts', overrides)
    const callback = load('src/app/api/spotify/callback/route.ts', overrides)

    for (const configured of [undefined, 'http://localhost:3000/api/spotify/callback', 'http://127.0.0.1:3000/api/spotify/callback']) {
      if (configured === undefined) delete process.env.SPOTIFY_OAUTH_REDIRECT_URI
      else process.env.SPOTIFY_OAUTH_REDIRECT_URI = configured
      const handoff = await auth.GET(request('http://localhost:3000/api/spotify/auth?redirect=/spotify'))
      assert.equal(handoff.headers.get('location'), 'http://127.0.0.1:3000/api/spotify/auth?redirect=%2Fspotify')
      assert.equal(handoff.cookies.get('sp_oauth_state'), undefined)
      const authorize = await auth.GET(request(handoff.headers.get('location')))
      const spotify = new URL(authorize.headers.get('location'))
      assert.equal(spotify.origin, 'https://accounts.spotify.com')
      const redirectUri = spotify.searchParams.get('redirect_uri')
      assert.equal(redirectUri, 'http://127.0.0.1:3000/api/spotify/callback')
      const state = authorize.cookies.get('sp_oauth_state').value
      assert.equal(spotify.searchParams.get('state'), state)
      global.fetch = async (url, options) => {
        assert.equal(url, 'https://accounts.spotify.com/api/token')
        assert.equal(options.body.get('redirect_uri'), redirectUri)
        return new Response(JSON.stringify({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 }))
      }
      const returned = await callback.GET(request(`${redirectUri}?code=test-code&state=${state}`, `sp_oauth_state=${state}; sp_oauth_redirect=/spotify`))
      assert.equal(returned.status, 307)
      assert.equal(returned.headers.get('location'), 'http://127.0.0.1:3000/spotify')
      assert.equal(returned.cookies.get('sp_access_token').value, 'test-access')
      const invalidState = await callback.GET(request(`${redirectUri}?code=test-code&state=invalid`, `sp_oauth_state=${state}`))
      assert.equal(invalidState.status, 400)
    }

    const req = request('https://trainer.example/api/spotify/auth')
    for (const uri of ['https://trainer.example/custom/callback', 'http://[::1]:3000/api/spotify/callback']) {
      assert.equal(helper.getSpotifyRedirectUri(req, uri), uri)
    }
    process.env.SPOTIFY_OAUTH_REDIRECT_URI = 'invalid'
    assert.equal((await auth.GET(req)).status, 500)
  } finally {
    global.fetch = originalFetch
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
