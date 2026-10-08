import { readFileSync, writeFileSync } from 'node:fs'

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('usage: node scripts/set-version.ts X.Y.Z')
  process.exit(2)
}

const path = new URL('../.claude-plugin/plugin.json', import.meta.url)
const manifest = JSON.parse(readFileSync(path, 'utf8'))
manifest.version = version
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
