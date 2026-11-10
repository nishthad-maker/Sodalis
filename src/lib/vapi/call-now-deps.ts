import { supabaseAdmin } from '@/lib/supabase/server'
import { loadSeniorToCall } from './call-context'
import type { CallNowDeps, VapiConfig } from './call-now'
import { startVapiCall } from './start-call'

function vapiConfig(env: NodeJS.ProcessEnv): VapiConfig | null {
  const apiKey = env.VAPI_API_KEY?.trim()
  const assistantId = env.VAPI_ASSISTANT_ID?.trim()
  const phoneNumberId = env.VAPI_PHONE_NUMBER_ID?.trim()
  return apiKey && assistantId && phoneNumberId ? { apiKey, assistantId, phoneNumberId } : null
}

/** The real collaborators for POST /api/hope/call-now. */
export function callNowDeps(): CallNowDeps {
  const db = supabaseAdmin()
  return {
    vapi: vapiConfig(process.env),
    async memberSenior(memberId) {
      const { data, error } = await db.from('family_members').select('senior_id').eq('id', memberId).maybeSingle()
      if (error) throw new Error(error.message)
      return data?.senior_id ?? null
    },
    async claimCall(seniorId, now, cutoff) {
      const { data: before, error: readError } = await db
        .from('seniors')
        .select('last_call_requested_at')
        .eq('id', seniorId)
        .maybeSingle()
      if (readError) throw new Error(readError.message)
      if (!before) return false

      // One conditional UPDATE: of two presses at once, only one row update succeeds.
      const { data, error } = await db
        .from('seniors')
        .update({ last_call_requested_at: now.toISOString() })
        .eq('id', seniorId)
        .or(`last_call_requested_at.is.null,last_call_requested_at.lt.${cutoff.toISOString()}`)
        .select('id')
      if (error) throw new Error(error.message)
      return data && data.length > 0 ? { previous: before.last_call_requested_at ?? null } : false
    },
    async releaseCall(seniorId, previous) {
      const { error } = await db.from('seniors').update({ last_call_requested_at: previous }).eq('id', seniorId)
      if (error) throw new Error(error.message)
    },
    loadSenior: (seniorId, now) => loadSeniorToCall(db, seniorId, now),
    startCall: (vapi, senior) =>
      startVapiCall({
        ...vapi,
        customer: { number: senior.phone_e164, name: senior.name },
        variables: senior.variables,
      }),
    now: () => new Date(),
  }
}
