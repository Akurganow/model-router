import type { Register } from 'claude-code'
import { route } from './router.ts'

const HTTP_TIMEOUT_MS = 8000

type AgentCall = {
  prompt: string
  description: string
  subagent_type?: string
  model?: string
  effort?: string
  name?: string
}

export const register: Register = (on, options) => {
  const mode = options.mode === 'auto' ? 'auto' : 'suggest'
  // The key is the plugin's sensitive userConfig option and goes only to TypeSafe, which issued it.
  const apiKey = typeof options.api_key === 'string' && options.api_key !== '' ? options.api_key : undefined

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const call = e as typeof e & AgentCall
    // A fork inherits its parent's model, a named agent is a teammate, and a caller-named model keeps its effort too.
    if (call.subagent_type === 'fork' || call.name !== undefined || call.model !== undefined) return next(e)
    const keep = call.effort !== undefined

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

    const decision = await route({ role: call.subagent_type ?? 'general-purpose', description: call.description, prompt: call.prompt }, post)
    if ('skipped' in decision) {
      $.ui.log(`skipped, ${decision.skipped}`)
      return next(e)
    }
    const { level, model, workIndex, effort, probabilities } = decision
    const p = `${probabilities.tier[String(level)].toFixed(2)}/${probabilities.work[String(workIndex)].toFixed(2)}`
    const pick = `L${level} ${model} · ${keep ? 'caller effort' : effort} · p=${p}`
    if (mode === 'suggest') {
      $.ui.log(`would pick ${pick}`)
      return next(e)
    }
    $.ui.log(pick)
    const r = await next(keep ? { ...e, model } : { ...e, model, effort })
    if ('deny' in r && r.deny !== undefined) $.ui.log('denied')
    return r
  }).catch(($, e, next) => next(e))
}
