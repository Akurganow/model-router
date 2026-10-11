import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// claude plugin validate --json lists, per module, one "hooks:" and one "calls:" note.
type Surface = { hooks: string[]; calls: string[] }
type Report = { contents: { notes?: string[] }[] }

const expected: Surface = JSON.parse(readFileSync(new URL('../tools/surface.json', import.meta.url), 'utf8'))
const report: Report = JSON.parse(execFileSync('claude', ['plugin', 'validate', '.', '--json'], { encoding: 'utf8' }))
const notes = report.contents.flatMap(c => c.notes ?? [])

const listed = (kind: keyof Surface): string[] =>
  notes.flatMap(note => {
    const m = note.match(new RegExp(`^\\S+ ${kind}: (.+)$`))
    return m ? m[1].split(',').map(s => s.trim()) : []
  }).sort()

let ok = true
for (const kind of ['hooks', 'calls'] as const) {
  const found = listed(kind)
  const want = [...expected[kind]].sort()
  if (found.join('\n') !== want.join('\n')) {
    ok = false
    console.error(`${kind} differ from tools/surface.json\n  found:  ${found.join(', ')}\n  listed: ${want.join(', ')}`)
  }
}
if (!ok) {
  console.error('A new hook or engine call changes what the directory and users see. Update tools/surface.json on purpose, with the README, or drop the change.')
  process.exit(1)
}
console.log(`surface matches: ${expected.hooks.join(', ')} · ${expected.calls.join(', ')}`)
