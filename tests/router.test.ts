import { expect, test } from 'claude-code/testing'
import { BUDGET_CHARS, JEV_MODEL, TIERS, WORK_LEVELS, route } from '../hooks/router.ts'

type Sent = { body: Record<string, any> }

const score = (p: Record<string, number>) => ({ type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: p })

const answer = (tier: Record<string, number>, work: Record<string, number> = { '0': 0.2, '1': 0.6, '2': 0.2 }) => JSON.stringify({
  model: JEV_MODEL,
  answers: { tier: score(tier), work: score(work) },
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
  const prompt = 'Use header Bearer abc.DEF-123 and key sk-abcdefghijklmnop; set API_KEY=hunter22 and DB_TOKEN: "t0k3n". Keep the config keys in order.'
  await route(input(prompt), stubPost(sent))
  const task: string = sent.body.state.task
  expect(task).toContain('Bearer ***')
  expect(task).not.toContain('abc.DEF-123')
  expect(task).not.toContain('sk-abcdefghijklmnop')
  expect(task).toContain('API_KEY=***')
  expect(task).not.toContain('hunter22')
  expect(task).toContain('DB_TOKEN: ***')
  expect(task).toContain('Keep the config keys in order.')
})

test('the request pins the model, names the state fields and carries both questions', async () => {
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
  const work = sent.body.questions.work
  expect(work.type).toBe('score')
  expect(work.instructions).toContain('`task`')
  expect(work.criteria).toEqual(WORK_LEVELS)
})

test('the decision names the tier, the work index and the effort from the ladder', async () => {
  const sent: Sent = { body: {} }
  const d = await route(input('Fix the named defect.'), stubPost(sent, answer({ '0': 0.2, '1': 0.7, '2': 0.1 }, { '0': 0.7, '1': 0.2, '2': 0.1 })))
  expect(d).toEqual({
    model: 'sonnet',
    level: 1,
    workIndex: 0,
    effort: 'low',
    probabilities: { tier: { '0': 0.2, '1': 0.7, '2': 0.1 }, work: { '0': 0.7, '1': 0.2, '2': 0.1 } },
  })
  const haiku = await route(input('Fix the named defect.'), stubPost(sent, answer({ '0': 1, '1': 0, '2': 0 }, { '0': 0.7, '1': 0.2, '2': 0.1 })))
  expect('model' in haiku && haiku.model).toBe('haiku')
  expect('effort' in haiku && haiku.effort).toBe('medium')
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

test('a JSON-quoted or single-quoted secret name still masks its value', async () => {
  const sent: Sent = { body: {} }
  await route(input('{"API_KEY": "abc123"} and {\'API_KEY\': \'abc123\'}'), stubPost(sent))
  expect(sent.body.state.task).toBe('{"API_KEY": ***} and {\'API_KEY\': ***}')
})

test('a quoted value with spaces is masked whole, closed or not', async () => {
  const sent: Sent = { body: {} }
  await route(input('export API_KEY="abc def ghi"'), stubPost(sent))
  expect(sent.body.state.task).toBe('export API_KEY=***')
  await route(input('export API_KEY="abc def'), stubPost(sent))
  expect(sent.body.state.task).toBe('export API_KEY=***')
})

test('the Bearer scheme is matched in any case', async () => {
  const sent: Sent = { body: {} }
  await route(input('send with bearer abc123'), stubPost(sent))
  expect(sent.body.state.task).toBe('send with Bearer ***')
})

test('assignments to names ending in key, token, secret or password are masked in any case', async () => {
  const sent: Sent = { body: {} }
  await route(input('api_key=hunter22 and apiKey: "sw0rdf1sh" and password=letmein'), stubPost(sent))
  const task: string = sent.body.state.task
  expect(task).toContain('api_key=***')
  expect(task).toContain('apiKey: ***')
  expect(task).toContain('password=***')
  for (const secret of ['hunter22', 'sw0rdf1sh', 'letmein']) expect(task).not.toContain(secret)
})

test('a near tie goes to the highest level within the margin', async () => {
  const sent: Sent = { body: {} }
  const close = await route(input('x'), stubPost(sent, answer({ '0': 0.2, '1': 0.42, '2': 0.38 })))
  expect('level' in close && close.level).toBe(2)
  const clear = await route(input('x'), stubPost(sent, answer({ '0': 0.1, '1': 0.6, '2': 0.3 })))
  expect('level' in clear && clear.level).toBe(1)
  const flat = await route(input('x'), stubPost(sent, answer({ '0': 0.34, '1': 0.33, '2': 0.33 })))
  expect('level' in flat).toBe(true)
  expect('level' in flat && flat.level).toBe(2)
  const second = await route(input('x'), stubPost(sent, answer({ '0': 0.5, '1': 0.45, '2': 0.05 })))
  expect('level' in second).toBe(true)
  expect('level' in second && second.level).toBe(1)
})

test('the work index rests on the middle unless an end has more than twice its probability', async () => {
  const sent: Sent = { body: {} }
  const cases: [Record<string, number>, number][] = [
    [{ '0': 0.4, '1': 0.35, '2': 0.25 }, 1],
    [{ '0': 0.7, '1': 0.3, '2': 0 }, 0],
    [{ '0': 0, '1': 0.3, '2': 0.7 }, 2],
    [{ '0': 0.6, '1': 0.3, '2': 0.1 }, 1],
    [{ '0': 0.45, '1': 0.1, '2': 0.45 }, 2],
  ]
  for (const [work, expected] of cases) {
    const d = await route(input('x'), stubPost(sent, answer({ '0': 0, '1': 1, '2': 0 }, work)))
    expect('workIndex' in d && d.workIndex).toBe(expected)
  }
})

test('a malformed work answer is a skip', async () => {
  const body = JSON.stringify({ model: JEV_MODEL, answers: { tier: score({ '0': 1, '1': 0, '2': 0 }) } })
  const d = await route(input('x'), async () => body)
  expect(d).toEqual({ skipped: 'malformed answer' })
})

test('a null work distribution is a skip', async () => {
  const body = JSON.stringify({ model: JEV_MODEL, answers: { tier: score({ '0': 1, '1': 0, '2': 0 }), work: { type: 'score', probabilities: null } } })
  const d = await route(input('x'), async () => body)
  expect(d).toEqual({ skipped: 'malformed answer' })
})
