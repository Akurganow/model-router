export const JEV_MODEL = 'jev-1.13.0'
export const BUDGET_CHARS = 12000
export const TIE_MARGIN = 0.1
export const WORK_PRIOR = [0.5, 1, 0.5] as const

export type Model = 'haiku' | 'sonnet' | 'opus'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh'
export type Level = 0 | 1 | 2
export type Probabilities = Record<string, number>

export const TIERS: readonly { model: Model; text: string }[] = [
  { model: 'haiku', text: 'Lookup or transcription: the brief names the files to read and holds the exact code, config or prose to write, the commands to run and the check that proves the work done. No choice is left.' },
  { model: 'sonnet', text: 'Bounded judgment: the brief fixes the goal and a way to check the result. Check work against stated requirements, fix named defects, implement from a given plan or spec, or answer a question from a few named files.' },
  { model: 'opus', text: 'Open judgment: the brief leaves the approach open. Decide a design, create content with no plan or spec to follow, review a multi-file change for risks no checklist names, or debug with an unclear cause.' },
]

export const WORK_LEVELS: readonly string[] = [
  'A short task: a handful of steps in one place, and the given check is the whole verification.',
  'An ordinary task: several steps or files, with edge cases to notice and a result to verify.',
  'A long or delicate task: many steps or files, hidden edge cases, or a wrong result that would look right.',
]

// Effort is calibrated per model, so one work index lands on a different setting per model.
// Haiku never runs below medium: at low it stops early on agentic prompts.
export const EFFORT_LADDER: Record<Model, readonly [Effort, Effort, Effort]> = {
  haiku: ['medium', 'high', 'xhigh'],
  sonnet: ['low', 'medium', 'high'],
  opus: ['low', 'medium', 'high'],
}

const TIER_INSTRUCTIONS = 'How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller\'s one-line summary of the task.'
const WORK_INSTRUCTIONS = 'How much work does completing `task` take for an agent whose role is `role`, once the judgment is settled? Count the steps, the files and the edge cases to verify.'

// The task text goes to a third party, and nothing marks which strings are secrets, so redaction matches shapes.
const REDACT_PATTERNS: readonly [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, '***'],
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi, '$1$2***'],
]

export type RouteInput = { role: string; description: string; prompt: string }
export type Post = (body: string) => Promise<string>
export type Decision = {
  model: Model
  level: Level
  workIndex: Level
  effort: Effort
  probabilities: { tier: Probabilities; work: Probabilities }
}
export type Skipped = { skipped: string }

export async function route(input: RouteInput, post: Post): Promise<Decision | Skipped> {
  const task = redact(condense(input.prompt))
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: { role: input.role, description: input.description, task },
    questions: {
      tier: { type: 'score', instructions: TIER_INSTRUCTIONS, criteria: TIERS.map(t => t.text) },
      work: { type: 'score', instructions: WORK_INSTRUCTIONS, criteria: WORK_LEVELS },
    },
  })
  let text: string
  try {
    text = await post(body)
  } catch (err) {
    return { skipped: err instanceof Error ? err.message : String(err) }
  }
  let answers: unknown
  try {
    answers = JSON.parse(text)?.answers
  } catch {
    return { skipped: 'malformed answer' }
  }
  const tier = parseScore(answers, 'tier', TIERS.length)
  const work = parseScore(answers, 'work', WORK_LEVELS.length)
  if (!tier || !work) return { skipped: 'malformed answer' }
  const level = pickTier(tier)
  const workIndex = pickWork(work)
  const model = TIERS[level].model
  return { model, level, workIndex, effort: EFFORT_LADDER[model][workIndex], probabilities: { tier, work } }
}

function condense(text: string): string {
  return text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, block: string) => {
      const lines = block.replace(/\n$/, '').split('\n').length
      return `[an exact block of ${lines} lines is given verbatim]`
    })
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, BUDGET_CHARS)
}

function redact(text: string): string {
  return REDACT_PATTERNS.reduce((t, [pattern, replacement]) => t.replace(pattern, replacement), text)
}

function parseScore(answers: unknown, key: string, levels: number): Probabilities | undefined {
  const a = (answers as Record<string, any> | undefined)?.[key]
  if (a?.type !== 'score' || typeof a.probabilities !== 'object') return undefined
  const probabilities: Probabilities = {}
  for (let i = 0; i < levels; i++) {
    const p = a.probabilities[String(i)]
    if (typeof p !== 'number') return undefined
    probabilities[String(i)] = p
  }
  return probabilities
}

// A near tie goes to the higher level: when unsure, the larger model.
function pickTier(p: Probabilities): Level {
  const [best, second] = ([0, 1, 2] as Level[]).sort((a, b) => p[String(b)] - p[String(a)])
  return p[String(best)] - p[String(second)] < TIE_MARGIN ? (Math.max(best, second) as Level) : best
}

// The middle is the resting point: an end wins only with more than twice its probability.
function pickWork(p: Probabilities): Level {
  let best: Level = 1
  for (const i of [0, 2] as Level[]) {
    if (p[String(i)] * WORK_PRIOR[i] > p[String(best)] * WORK_PRIOR[best]) best = i
  }
  return best
}
