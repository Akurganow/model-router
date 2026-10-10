import type { Register } from 'claude-code'
import { route, type Effort } from './router.ts'

const HTTP_TIMEOUT_MS = 8000

export const register: Register = (on, options) => {
  const mode = options.mode === 'auto' ? 'auto' : 'suggest'
  // The key is the plugin's sensitive userConfig option and goes only to TypeSafe, which issued it.
  const apiKey = typeof options.api_key === 'string' && options.api_key !== '' ? options.api_key : undefined
  // Read by the turn.step hook below. Never emptied: a session spawns at most hundreds of agents.
  // A reload starts it empty, so agents already running keep the engine's effort.
  const effortByAgent = new Map<string, Effort>()
  // The spawn event does not carry the Agent call's effort, so calls that name one are matched by tool_use_id.
  // Ids of calls that never spawn stay, one short string each.
  const callerEffort = new Set<string>()

  on('tool.call', { tool: 'Agent' }, ($, e, next) => {
    if (e.effort !== undefined) callerEffort.add(e.tool_use_id)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const keep = callerEffort.delete(e.tool_use_id)
    if (e.fork || e.isTeammate || e.workflow !== undefined || e.model !== undefined) return next(e)

    const post = async (body: string): Promise<string> => {
      if (!apiKey) throw new Error('api_key unset')
      const stop = new AbortController()
      const timeout = $.clock.sleep(HTTP_TIMEOUT_MS, { signal: stop.signal })
        .then(() => { throw new Error(`no answer in ${HTTP_TIMEOUT_MS} ms`) })
      try {
        const res = await Promise.race([
          $.http.fetch('https://api.typesafe.ai/v1/systemone', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body,
          }),
          timeout,
        ])
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text
      } finally {
        stop.abort()
      }
    }

    const decision = await route({ role: e.subagentType, description: e.description, prompt: e.prompt }, post)
    if ('skipped' in decision) {
      $.ui.log(`skipped, ${decision.skipped}`)
      return next(e)
    }
    const { level, model, workIndex, effort, probabilities } = decision
    const p = `${probabilities.tier[String(level)].toFixed(2)}/${probabilities.work[String(workIndex)].toFixed(2)}`
    const pick = `L${level} ${model} · ${keep ? 'caller effort' : effort} · p=${p}`
    if (mode === 'suggest') {
      const r = await next(e)
      $.ui.log(`would pick ${pick} · ran on ${'deny' in r && r.deny !== undefined ? 'nothing, denied' : r.model}`)
      return r
    }
    const r = await next({ ...e, model })
    // A forced or substituted model (CLAUDE_CODE_SUBAGENT_MODEL_FORCE, availableModels) keeps the engine's effort.
    if (r.agentId !== undefined && !keep && r.model.includes(model)) effortByAgent.set(r.agentId, effort)
    $.ui.log('deny' in r && r.deny !== undefined ? `${pick} · denied` : pick)
    return r
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const effort = e.agentId === undefined ? undefined : effortByAgent.get(e.agentId)
    return yield* next(effort === undefined ? e : { ...e, effort })
  })
}
