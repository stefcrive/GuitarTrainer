import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

export type MarkerDecisionProvider = 'llm' | 'jev'
type SettingsUpdate = { provider: MarkerDecisionProvider; jevApiKey?: string; openaiApiKey?: string }

// Desktop installations already put their root registry in the writable user-data directory.
const settingsFile = process.env.GUITAR_TRAINER_SETTINGS_ENV
  ?? path.join(process.env.GUITAR_TRAINER_ROOT_REGISTRY
    ? path.dirname(process.env.GUITAR_TRAINER_ROOT_REGISTRY)
    : process.cwd(), '.env.local')

async function readSettingsFile() {
  try {
    return await readFile(settingsFile, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw new Error('Unable to read marker generation settings.')
  }
}

export async function getMarkerGenerationEnv(): Promise<Record<string, string | undefined>> {
  const text = await readSettingsFile()
  const values: Record<string, string | undefined> = {}
  for (const key of ['TYPESAFE_API_KEY', 'OPENAI_API_KEY', 'MARKER_DECISION_PROVIDER']) {
    const match = text.match(new RegExp(`^${key}=[ \\t]*(.*?)[ \\t]*$`, 'm'))
    if (match) values[key] = match[1].trim().replace(/^['"]|['"]$/g, '')
    else if (process.env[key]) values[key] = process.env[key]
  }
  values.MARKER_DECISION_PROVIDER ||= values.TYPESAFE_API_KEY ? 'jev' : 'llm'
  return values
}

export async function getMarkerGenerationSettings() {
  const env = await getMarkerGenerationEnv()
  return {
    provider: env.MARKER_DECISION_PROVIDER === 'jev' ? 'jev' : 'llm',
    jevConfigured: Boolean(env.TYPESAFE_API_KEY),
    openaiConfigured: Boolean(env.OPENAI_API_KEY)
  }
}

let pendingWrite = Promise.resolve()

export function saveMarkerGenerationSettings(update: SettingsUpdate) {
  const write = pendingWrite.then(async () => {
    let text = await readSettingsFile()
    const values: Record<string, string | undefined> = {
      MARKER_DECISION_PROVIDER: update.provider,
      TYPESAFE_API_KEY: update.jevApiKey,
      OPENAI_API_KEY: update.openaiApiKey
    }
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue
      const pattern = new RegExp(`^${key}=.*(?:\\r?\\n|$)`, 'gm')
      text = text.replace(pattern, '')
      text = `${text.trimEnd()}\n${key}=${value}\n`
    }
    await mkdir(path.dirname(settingsFile), { recursive: true })
    const temporary = `${settingsFile}.tmp`
    await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, settingsFile)
  })
  pendingWrite = write.catch(() => undefined)
  return write
}
