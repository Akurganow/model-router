import { expect, mock, test } from 'claude-code/testing'

const ANSWER = (p0: number, p1: number, p2: number) => JSON.stringify({
  model: 'jev-1.13.0',
  answers: { tier: { type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: { '0': p0, '1': p1, '2': p2 } } },
  usage: { input_tokens: 1, output_tokens: 1 },
})

const spawn = (over: Record<string, unknown> = {}) => ({
  tool_use_id: 'toolu_1',
  prompt: 'Create src/hello.ts with exactly this content and run the tests.',
  description: 'write hello',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
  ...over,
}) as any

type Harness = { logs: string[]; fetched: number; received: any }

const harness = (on: any, fetchText = ANSWER(0.9, 0.1, 0), status = 200): Harness => {
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  mock.clock(on)
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', () => { h.fetched += 1; return { value: { status, ok: status < 300, headers: {}, text: fetchText } } })
  on('agent.spawn', (_: unknown, e: any) => { h.received = e; return { model: e.model ?? e.parentModel, agentId: 'a1' } })
  return h
}

test('auto sets the model Jev picked', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBe('haiku')
  expect(h.logs).toEqual(['model-router: L0 haiku · p=0.90'])
})

test('suggest leaves the model alone and logs both models', { options: { api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, ANSWER(0.1, 0.2, 0.7))
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['model-router would pick L2 opus · p=0.70 · ran on claude-opus-5-5'])
})

test('a fork, a teammate, a workflow agent and a caller-named model pass through without a fetch', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn({ fork: true }))
  await $.agent.spawn(spawn({ isTeammate: true, background: true }))
  await $.agent.spawn(spawn({ workflow: { runId: 'run1', agentIndex: 1 } }))
  expect(h.received.model).toBeUndefined()
  await $.agent.spawn(spawn({ model: 'sonnet' }))
  expect(h.received.model).toBe('sonnet')
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual([])
})

test('a missing key passes through and says so', { options: { mode: 'auto' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['model-router: skipped, api_key unset'])
})

test('an empty key passes through like a missing one', { options: { mode: 'auto', api_key: '' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['model-router: skipped, api_key unset'])
})

test('an HTTP error passes through and names the status', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'overloaded', 529)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['model-router: skipped, HTTP 529'])
})

test('a malformed answer passes through', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'not json')
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['model-router: skipped, malformed answer'])
})

test('a slow Jev passes through after the timeout', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const clock = mock.clock(on)
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', async () => { await clock.sleep(60000); return { value: { status: 200, ok: true, headers: {}, text: ANSWER(1, 0, 0) } } })
  on('agent.spawn', (_: unknown, e: any) => { h.received = e; return { model: e.model ?? e.parentModel, agentId: 'a1' } })
  const pending = $.agent.spawn(spawn())
  await clock.advance(8000)
  await pending
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['model-router: skipped, no answer in 8000 ms'])
})

test('the request goes to the systemone endpoint with the key and the pinned model', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  mock.clock(on)
  let request: any
  on('ui.log', () => ({ value: undefined }))
  on('http.fetch', (_: unknown, e: any) => { request = e; return { value: { status: 200, ok: true, headers: {}, text: ANSWER(0.9, 0.1, 0) } } })
  on('agent.spawn', (_: unknown, e: any) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  await $.agent.spawn(spawn())
  expect(request.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(request.init.method).toBe('POST')
  expect(request.init.headers.Authorization).toBe('Bearer test-key')
  expect(request.init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(request.init.body).model).toBe('jev-1.13.0')
})
