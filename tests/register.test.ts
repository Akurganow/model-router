import { expect, mock, test } from 'claude-code/testing'

const score = (p: number[]) => ({ type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: { '0': p[0], '1': p[1], '2': p[2] } })

const ANSWER = (tier: number[], work: number[] = [0.2, 0.6, 0.2]) => JSON.stringify({
  model: 'jev-1.13.0',
  answers: { tier: score(tier), work: score(work) },
  usage: { input_tokens: 1, output_tokens: 1 },
})

const TOOL_RESULT = { result: 'ok' } as any

const agentCall = (over: Record<string, unknown> = {}) => ({
  tool: 'Agent',
  tool_use_id: 'toolu_1',
  prompt: 'Create src/hello.ts with exactly this content and run the tests.',
  description: 'write hello',
  subagent_type: 'general-purpose',
  ...over,
}) as any

type Harness = { logs: string[]; fetched: number; received: any }

const harness = (on: any, fetchText = ANSWER([0.9, 0.1, 0]), status = 200): Harness => {
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  mock.clock(on)
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', () => { h.fetched += 1; return { value: { status, ok: status < 300, headers: {}, text: fetchText } } })
  on('tool.call', (_: unknown, e: any) => { h.received = e; return TOOL_RESULT })
  return h
}

test('auto sets the model and the effort on the Agent call', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on)
  const r: any = await $.tool.call(agentCall())
  expect(h.received.model).toBe('haiku')
  expect(h.received.effort).toBe('high')
  expect(h.received.prompt).toBe(agentCall().prompt)
  expect(r.result).toBe('ok')
  expect(h.logs).toEqual(['L0 haiku · high · p=0.90/0.60'])
})

test('suggest leaves the call alone and logs the pick', { options: { api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, ANSWER([0.1, 0.2, 0.7]))
  await $.tool.call(agentCall())
  expect(h.received.model).toBeUndefined()
  expect(h.received.effort).toBeUndefined()
  expect(h.logs).toEqual(['would pick L2 opus · medium · p=0.70/0.60'])
})

test('a fork, a named agent and a caller-named model pass through without a fetch', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on)
  await $.tool.call(agentCall({ subagent_type: 'fork' }))
  expect(h.received.model).toBeUndefined()
  await $.tool.call(agentCall({ name: 'scout' }))
  expect(h.received.model).toBeUndefined()
  await $.tool.call(agentCall({ model: 'sonnet' }))
  expect(h.received.model).toBe('sonnet')
  expect(h.received.effort).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual([])
})

test('a call without an agent type is routed as general-purpose', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  mock.clock(on)
  let request: any
  on('ui.log', () => ({ value: undefined }))
  on('http.fetch', (_: unknown, e: any) => { request = e; return { value: { status: 200, ok: true, headers: {}, text: ANSWER([0.9, 0.1, 0]) } } })
  on('tool.call', () => TOOL_RESULT)
  await $.tool.call(agentCall({ subagent_type: undefined }))
  expect(JSON.parse(request.init.body).state.role).toBe('general-purpose')
})

test('a missing key passes through and says so', { options: { mode: 'auto' } }, async ($, on) => {
  const h = harness(on)
  await $.tool.call(agentCall())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['skipped, api_key unset'])
})

test('an empty key passes through like a missing one', { options: { mode: 'auto', api_key: '' } }, async ($, on) => {
  const h = harness(on)
  await $.tool.call(agentCall())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['skipped, api_key unset'])
})

test('an HTTP error passes through and names the status', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'overloaded', 529)
  await $.tool.call(agentCall())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['skipped, HTTP 529'])
})

test('a malformed answer passes through', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'not json')
  await $.tool.call(agentCall())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['skipped, malformed answer'])
})

test('a slow Jev passes through after the timeout', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const clock = mock.clock(on)
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', async () => { await clock.sleep(60000); return { value: { status: 200, ok: true, headers: {}, text: ANSWER([1, 0, 0]) } } })
  on('tool.call', (_: unknown, e: any) => { h.received = e; return TOOL_RESULT })
  const pending = $.tool.call(agentCall())
  await clock.advance(8000)
  await pending
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['skipped, no answer in 8000 ms'])
})

test('the request goes to the systemone endpoint with the key and the pinned model', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  mock.clock(on)
  let request: any
  on('ui.log', () => ({ value: undefined }))
  on('http.fetch', (_: unknown, e: any) => { request = e; return { value: { status: 200, ok: true, headers: {}, text: ANSWER([0.9, 0.1, 0]) } } })
  on('tool.call', () => TOOL_RESULT)
  await $.tool.call(agentCall())
  expect(request.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(request.init.method).toBe('POST')
  expect(request.init.headers.Authorization).toBe('Bearer test-key')
  expect(request.init.headers['Content-Type']).toBe('application/json')
  const body = JSON.parse(request.init.body)
  expect(body.model).toBe('jev-1.13.0')
  expect(body.state.description).toBe('write hello')
})

test('an Agent call that names an effort keeps it and gets the model', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, ANSWER([0.1, 0.8, 0.1]))
  await $.tool.call(agentCall({ effort: 'low' }))
  expect(h.received.model).toBe('sonnet')
  expect(h.received.effort).toBe('low')
  expect(h.logs).toEqual(['L1 sonnet · caller effort · p=0.80/0.60'])
})

test('a denied call in auto mode says so and returns the denial', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  mock.clock(on)
  const logs: string[] = []
  on('ui.log', (_: unknown, e: { text: string }) => { logs.push(e.text); return { value: undefined } })
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: ANSWER([0.9, 0.1, 0]) } }))
  on('tool.call', () => ({ deny: 'no' }))
  const r: any = await $.tool.call(agentCall())
  expect(r.deny).toBe('no')
  expect(logs).toEqual(['L0 haiku · high · p=0.90/0.60 · denied'])
})
