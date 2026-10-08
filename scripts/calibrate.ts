import { readFileSync } from 'node:fs'
import { route } from '../hooks/router.ts'

const AGREEMENT_BAR = 0.85
const JEV_URL = 'https://api.typesafe.ai/v1/systemone'

type Case = { role: string; description: string; text: string; expected: number }

const key = process.env.TYPESAFE_API_KEY
if (!key) {
  console.error('TYPESAFE_API_KEY unset')
  process.exit(2)
}

const post = async (body: string): Promise<string> => {
  const res = await fetch(JEV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

const cases: Case[] = readFileSync(new URL('../calibration.jsonl', import.meta.url), 'utf8')
  .split('\n')
  .filter(line => line.trim() !== '')
  .map(line => JSON.parse(line))

let hits = 0
for (const c of cases) {
  const d = await route({ role: c.role, description: c.description, prompt: c.text }, post)
  const head = c.text.slice(0, 60).replace(/\n/g, ' ')
  if ('skipped' in d) {
    console.log(`skip  ${head}  ${d.skipped}`)
    continue
  }
  if (d.level === c.expected) hits += 1
  else console.log(`miss  expected ${c.expected}  got ${d.level}  p=${d.probabilities[String(d.level)].toFixed(2)}  ${head}`)
}

const agreement = hits / cases.length
console.log(`agreement ${(agreement * 100).toFixed(0)}% (${hits}/${cases.length}), bar ${AGREEMENT_BAR * 100}%`)
process.exit(agreement >= AGREEMENT_BAR ? 0 : 1)
