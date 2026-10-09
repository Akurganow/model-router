import { expect, mock, test } from 'claude-code/testing'

const score = (p: number[]) => ({ type: 'score', score: 0, confidence: 0.9, legend: {}, probabilities: { '0': p[0], '1': p[1], '2': p[2] } })

const ANSWER = (tier: number[], work: number[] = [0.2, 0.6, 0.2]) => JSON.stringify({
  model: 'jev-1.13.0',
  answers: { tier: score(tier), work: score(work) },
  usage: { input_tokens: 1, output_tokens: 1 },
})

const step = (over: Record<string, unknown> = {}) => ({
  turnId: 't1',
  index: 0,
  model: 'claude-sonnet-5-5',
  effort: 'high',
  messageCount: 1,
  ...over,
}) as any

const drain = async (stream: AsyncIterable<unknown>) => { for await (const _ of stream) { /* chunks are not under test */ } }

const STEP_RESULT = { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as any

const CHUNK = { kind: 'text', index: 0, text: 'hi' } as any

const TOOL_RESULT = { result: 'ok' } as any

const recordEfforts = (on: any) => {
  const efforts: unknown[] = []
  on('turn.step', async function* (_: unknown, e: any) { efforts.push(e.effort); return STEP_RESULT })
  return efforts
}

const agentCall = (over: Record<string, unknown> = {}) => ({
  tool: 'Agent',
  tool_use_id: 'toolu_1',
  prompt: 'Create src/hello.ts with exactly this content and run the tests.',
  description: 'write hello',
  subagent_type: 'general-purpose',
  ...over,
}) as any

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

const harness = (on: any, fetchText = ANSWER([0.9, 0.1, 0]), status = 200): Harness => {
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  mock.clock(on)
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', () => { h.fetched += 1; return { value: { status, ok: status < 300, headers: {}, text: fetchText } } })
  on('agent.spawn', (_: unknown, e: any) => { h.received = e; return { model: e.model ?? e.parentModel, agentId: e.tool_use_id === 'toolu_2' ? 'a2' : 'a1' } })
  return h
}

test('auto sets the model Jev picked', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBe('haiku')
  expect(h.logs).toEqual(['L0 haiku · high · p=0.90/0.60'])
})

test('suggest leaves the model alone and logs both models', { options: { api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, ANSWER([0.1, 0.2, 0.7]))
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['would pick L2 opus · medium · p=0.70/0.60 · ran on claude-opus-5-5'])
})

test('a fork, a teammate, a workflow agent and a caller-named model pass through without a fetch', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const efforts = recordEfforts(on)
  const h = harness(on)
  await $.agent.spawn(spawn({ fork: true }))
  await $.agent.spawn(spawn({ isTeammate: true, background: true }))
  await $.agent.spawn(spawn({ workflow: { runId: 'run1', agentIndex: 1 } }))
  expect(h.received.model).toBeUndefined()
  await $.agent.spawn(spawn({ model: 'sonnet' }))
  expect(h.received.model).toBe('sonnet')
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual([])
  await drain($.turn.step(step({ agentId: 'a1', effort: 'low' })))
  expect(efforts).toEqual(['low'])
})

test('a missing key passes through and says so', { options: { mode: 'auto' } }, async ($, on) => {
  const efforts = recordEfforts(on)
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['skipped, api_key unset'])
  await drain($.turn.step(step({ agentId: 'a1', effort: 'low' })))
  expect(efforts).toEqual(['low'])
})

test('an empty key passes through like a missing one', { options: { mode: 'auto', api_key: '' } }, async ($, on) => {
  const h = harness(on)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.fetched).toBe(0)
  expect(h.logs).toEqual(['skipped, api_key unset'])
})

test('an HTTP error passes through and names the status', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'overloaded', 529)
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['skipped, HTTP 529'])
})

test('a malformed answer passes through', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const h = harness(on, 'not json')
  await $.agent.spawn(spawn())
  expect(h.received.model).toBeUndefined()
  expect(h.logs).toEqual(['skipped, malformed answer'])
})

test('a slow Jev passes through after the timeout', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const clock = mock.clock(on)
  const h: Harness = { logs: [], fetched: 0, received: undefined }
  on('ui.log', (_: unknown, e: { text: string }) => { h.logs.push(e.text); return { value: undefined } })
  on('http.fetch', async () => { await clock.sleep(60000); return { value: { status: 200, ok: true, headers: {}, text: ANSWER([1, 0, 0]) } } })
  on('agent.spawn', (_: unknown, e: any) => { h.received = e; return { model: e.model ?? e.parentModel, agentId: 'a1' } })
  const pending = $.agent.spawn(spawn())
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
  on('agent.spawn', (_: unknown, e: any) => ({ model: e.model ?? e.parentModel, agentId: 'a1' }))
  await $.agent.spawn(spawn())
  expect(request.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(request.init.method).toBe('POST')
  expect(request.init.headers.Authorization).toBe('Bearer test-key')
  expect(request.init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(request.init.body).model).toBe('jev-1.13.0')
})

test('auto sets the effort of the routed agent\'s requests and leaves other requests alone', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  harness(on, ANSWER([0.1, 0.8, 0.1], [0.2, 0.6, 0.2]))
  const efforts = recordEfforts(on)
  await $.agent.spawn(spawn())
  await drain($.turn.step(step({ agentId: 'a1' })))
  await drain($.turn.step(step({ agentId: 'other' })))
  await drain($.turn.step(step()))
  expect(efforts).toEqual(['medium', 'high', 'high'])
})

test('suggest rewrites no request', { options: { api_key: 'test-key' } }, async ($, on) => {
  harness(on, ANSWER([0.1, 0.8, 0.1], [0.2, 0.6, 0.2]))
  const efforts = recordEfforts(on)
  await $.agent.spawn(spawn())
  await drain($.turn.step(step({ agentId: 'a1' })))
  expect(efforts).toEqual(['high'])
})

test('turn.step forwards the chunks and the result', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  harness(on)
  on('turn.step', async function* () { yield CHUNK; return STEP_RESULT })
  await $.agent.spawn(spawn())
  const stream = $.turn.step(step({ agentId: 'a1' }))
  const chunks: unknown[] = []
  let r = await stream.next()
  while (!r.done) { chunks.push(r.value); r = await stream.next() }
  expect(chunks).toEqual([CHUNK])
  expect(r.value).toEqual(STEP_RESULT)
})

test('a denied spawn in auto mode says so and records no effort', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  mock.clock(on)
  const logs: string[] = []
  on('ui.log', (_: unknown, e: { text: string }) => { logs.push(e.text); return { value: undefined } })
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: ANSWER([0.9, 0.1, 0]) } }))
  on('agent.spawn', () => ({ deny: 'no' }))
  await $.agent.spawn(spawn())
  expect(logs).toEqual(['L0 haiku · high · p=0.90/0.60 · denied'])
})

test('an Agent call that names an effort keeps it', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const efforts = recordEfforts(on)
  on('tool.call', () => TOOL_RESULT)
  const h = harness(on, ANSWER([0.1, 0.8, 0.1], [0.2, 0.6, 0.2]))
  await $.tool.call(agentCall({ effort: 'low' }))
  await $.agent.spawn(spawn())
  await drain($.turn.step(step({ agentId: 'a1' })))
  expect(efforts).toEqual(['high'])
  expect(h.received.model).toBe('sonnet')
  expect(h.logs).toEqual(['L1 sonnet · caller effort · p=0.80/0.60'])
})

test('an Agent call without an effort is routed as before', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const efforts = recordEfforts(on)
  on('tool.call', () => TOOL_RESULT)
  const h = harness(on, ANSWER([0.1, 0.8, 0.1], [0.2, 0.6, 0.2]))
  await $.tool.call(agentCall())
  await $.agent.spawn(spawn())
  await drain($.turn.step(step({ agentId: 'a1' })))
  expect(efforts).toEqual(['medium'])
  expect(h.logs).toEqual(['L1 sonnet · medium · p=0.80/0.60'])
})

test('a kept effort does not leak to the next call', { options: { mode: 'auto', api_key: 'test-key' } }, async ($, on) => {
  const efforts = recordEfforts(on)
  on('tool.call', () => TOOL_RESULT)
  harness(on, ANSWER([0.1, 0.8, 0.1], [0.2, 0.6, 0.2]))
  await $.tool.call(agentCall({ effort: 'low' }))
  await $.agent.spawn(spawn({ tool_use_id: 'toolu_1' }))
  await $.agent.spawn(spawn({ tool_use_id: 'toolu_1' }))
  await $.agent.spawn(spawn({ tool_use_id: 'toolu_2' }))
  await drain($.turn.step(step({ agentId: 'a1' })))
  await drain($.turn.step(step({ agentId: 'a2' })))
  expect(efforts).toEqual(['medium', 'medium'])
})
