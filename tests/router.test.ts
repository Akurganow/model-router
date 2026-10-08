import { expect, test } from 'claude-code/testing'
import { BUDGET_CHARS, JEV_MODEL, TIERS, route } from '../hooks/router.ts'

type Sent = { body: Record<string, any> }

const answer = (p: Record<string, number>, confidence = 0.9) => JSON.stringify({
  model: JEV_MODEL,
  answers: { tier: { type: 'score', score: 0, confidence, legend: {}, probabilities: p } },
  usage: { input_tokens: 1, output_tokens: 1 },
})

const stubPost = (sent: Sent, text = answer({ '0': 1, '1': 0, '2': 0 })) => async (body: string) => {
  sent.body = JSON.parse(body)
  return text
}

const input = (prompt: string) => ({ role: 'general-purpose', description: 'task', prompt })

test('a fenced block becomes a one-line size note', async () => {
  const sent: Sent = { body: {} }
  const prompt = 'Write this file:\n```ts\nconst a = 1\nconst b = 2\nconst c = 3\n```\nThen run the tests.'
  await route(input(prompt), stubPost(sent))
  expect(sent.body.state.task).toContain('[an exact block of 3 lines is given verbatim]')
  expect(sent.body.state.task).not.toContain('const a = 1')
})

test('runs of blank lines collapse and the text is cut at the budget', async () => {
  const sent: Sent = { body: {} }
  await route(input('a\n\n\n\nb' + 'x'.repeat(BUDGET_CHARS * 2)), stubPost(sent))
  expect(sent.body.state.task.startsWith('a\n\nb')).toBe(true)
  expect(sent.body.state.task.length).toBe(BUDGET_CHARS)
})

test('token-shaped strings are masked and ordinary text is kept', async () => {
  const sent: Sent = { body: {} }
  const prompt = 'Use header Bearer abc.DEF-123 and key sk-abcdefghijklmnop; set API_KEY=hunter22 and DB_TOKEN: "t0k3n". Keep key=value pairs in config.'
  await route(input(prompt), stubPost(sent))
  const task: string = sent.body.state.task
  expect(task).toContain('Bearer ***')
  expect(task).not.toContain('abc.DEF-123')
  expect(task).not.toContain('sk-abcdefghijklmnop')
  expect(task).toContain('API_KEY=***')
  expect(task).not.toContain('hunter22')
  expect(task).toContain('DB_TOKEN: ***')
  expect(task).toContain('Keep key=value pairs in config.')
})

test('the request pins the model, names the state fields and carries one criterion per tier', async () => {
  const sent: Sent = { body: {} }
  await route({ role: 'reviewer', description: 'review the diff', prompt: 'Review it.' }, stubPost(sent))
  expect(sent.body.model).toBe(JEV_MODEL)
  expect(sent.body.state.role).toBe('reviewer')
  expect(sent.body.state.description).toBe('review the diff')
  const tier = sent.body.questions.tier
  expect(tier.type).toBe('score')
  expect(tier.instructions).toContain('`task`')
  expect(tier.instructions).toContain('`role`')
  expect(tier.instructions).toContain('`description`')
  expect(tier.criteria).toEqual(TIERS.map(t => t.text))
})

test('the decision is the level with the highest probability', async () => {
  const sent: Sent = { body: {} }
  const d = await route(input('Fix the named defect.'), stubPost(sent, answer({ '0': 0.2, '1': 0.7, '2': 0.1 }, 0.6)))
  expect(d).toEqual({ model: 'sonnet', level: 1, probabilities: { '0': 0.2, '1': 0.7, '2': 0.1 }, confidence: 0.6 })
})

test('a rejecting post is a skip with its reason', async () => {
  const d = await route(input('x'), async () => { throw new Error('HTTP 500') })
  expect(d).toEqual({ skipped: 'HTTP 500' })
})

test('a malformed body is a skip', async () => {
  const d = await route(input('x'), async () => 'not json')
  expect(d).toEqual({ skipped: 'malformed answer' })
  const e = await route(input('x'), async () => JSON.stringify({ answers: {} }))
  expect(e).toEqual({ skipped: 'malformed answer' })
})
