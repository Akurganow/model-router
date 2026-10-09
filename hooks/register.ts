import type { Register } from 'claude-code'
import { route } from './router.ts'

const HTTP_TIMEOUT_MS = 8000

export const register: Register = (on, options) => {
  const mode = options.mode === 'auto' ? 'auto' : 'suggest'
  // The key is the plugin's sensitive userConfig option and goes only to TypeSafe, which issued it.
  const apiKey = typeof options.api_key === 'string' && options.api_key !== '' ? options.api_key : undefined

  on('agent.spawn', async ($, e, next) => {
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
    const top = decision.probabilities[String(decision.level)].toFixed(2)
    const pick = `L${decision.level} ${decision.model} · p=${top}`
    if (mode === 'suggest') {
      const r = await next(e)
      $.ui.log(`would pick ${pick} · ran on ${'deny' in r && r.deny !== undefined ? 'nothing, denied' : r.model}`)
      return r
    }
    const r = await next({ ...e, model: decision.model })
    $.ui.log(`${pick}`)
    return r
  }).catch(($, e, next) => next(e))
}
