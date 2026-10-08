export const JEV_MODEL = 'jev-1.13.0'
export const BUDGET_CHARS = 12000

export const TIERS = [
  { model: 'haiku', text: 'Lookup or transcription: the text holds the exact code, config or prose to write and the commands to run; no choice is left.' },
  { model: 'sonnet', text: 'Bounded judgment: check given work against stated requirements, fix named defects, or answer a question from a few named files.' },
  { model: 'opus', text: 'Open judgment: create new content or decide a design from source material, review a whole multi-file change, or debug with an unclear cause.' },
] as const

const INSTRUCTIONS = 'How much judgment does completing `task` require from an agent whose role is `role`? `description` is the caller\'s one-line summary of the task.'

// The task text goes to a third party. A mod reads environment variables only
// by literal name, so secrets are masked by shape, not by value.
const REDACT_PATTERNS: readonly [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer ***'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, '***'],
  [/\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))(["']?\s*[=:]\s*)(?:"[^"]*"?|'[^']*'?|[^\s"']+)/gi, '$1$2***'],
]

export type RouteInput = { role: string; description: string; prompt: string }
export type Post = (body: string) => Promise<string>
export type Decision = { model: string; level: number; probabilities: Record<string, number>; confidence: number }
export type Skipped = { skipped: string }

export async function route(input: RouteInput, post: Post): Promise<Decision | Skipped> {
  const task = redact(condense(input.prompt))
  const body = JSON.stringify({
    model: JEV_MODEL,
    state: { role: input.role, description: input.description, task },
    questions: { tier: { type: 'score', instructions: INSTRUCTIONS, criteria: TIERS.map(t => t.text) } },
  })
  let text: string
  try {
    text = await post(body)
  } catch (err) {
    return { skipped: err instanceof Error ? err.message : String(err) }
  }
  const parsed = parse(text)
  if (!parsed) return { skipped: 'malformed answer' }
  const level = argmax(parsed.probabilities)
  return { model: TIERS[level].model, level, probabilities: parsed.probabilities, confidence: parsed.confidence }
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

function parse(text: string): { probabilities: Record<string, number>; confidence: number } | undefined {
  try {
    const tier = JSON.parse(text)?.answers?.tier
    if (tier?.type !== 'score' || typeof tier.confidence !== 'number' || typeof tier.probabilities !== 'object') return undefined
    const probabilities: Record<string, number> = {}
    for (let i = 0; i < TIERS.length; i++) {
      const p = tier.probabilities[String(i)]
      if (typeof p !== 'number') return undefined
      probabilities[String(i)] = p
    }
    return { probabilities, confidence: tier.confidence }
  } catch {
    return undefined
  }
}

function argmax(probabilities: Record<string, number>): number {
  let best = 0
  for (let i = 1; i < TIERS.length; i++) {
    if (probabilities[String(i)] > probabilities[String(best)]) best = i
  }
  return best
}
