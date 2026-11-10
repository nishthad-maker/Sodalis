import { bad, isUuid, readJsonObject } from '@/lib/http'
import type { SeniorToCall } from './call-context'

// POST /api/hope/call-now (specs/02-api/routes.md): a family member asks Sodalis to phone their elder now.
// There are no accounts yet, so the caller is the member saved on this device. The member must belong to
// the elder, and each elder can be called at most once per COOLDOWN_MS, claimed in the database so the
// limit holds across serverless instances. Every collaborator is injected so this is testable offline.

export const COOLDOWN_MS = 5 * 60_000

export interface VapiConfig {
  apiKey: string
  assistantId: string
  phoneNumberId: string
}

export interface CallNowDeps {
  /** Null when VAPI_API_KEY, VAPI_ASSISTANT_ID or VAPI_PHONE_NUMBER_ID is missing. */
  vapi: VapiConfig | null
  /** The elder a member belongs to, or null for an unknown member. */
  memberSenior(memberId: string): Promise<string | null>
  /**
   * Marks the elder as called at `now` unless they were called after `cutoff`. Returns the previous
   * time (null if never) when the claim succeeded, or false when a recent call blocks it.
   */
  claimCall(seniorId: string, now: Date, cutoff: Date): Promise<{ previous: string | null } | false>
  /** Puts the claim back after a call that never started, so the family can try again. */
  releaseCall(seniorId: string, previous: string | null): Promise<void>
  loadSenior(seniorId: string, now: Date): Promise<SeniorToCall>
  startCall(vapi: VapiConfig, senior: SeniorToCall): Promise<{ id: string }>
  now(): Date
}

export function createCallNowRoute(deps: CallNowDeps) {
  return async function POST(request: Request): Promise<Response> {
    const body = await readJsonObject(request)
    if (body instanceof Response) return body
    const { senior_id, member_id } = body
    if (!isUuid(senior_id)) return bad('senior_id must be a UUID')
    if (!isUuid(member_id)) return bad('member_id must be a UUID')

    if (!deps.vapi) {
      console.error('call-now: Vapi is not configured (VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID)')
      return Response.json({ error: 'Calling is not set up yet' }, { status: 503 })
    }

    let memberSenior: string | null
    try {
      memberSenior = await deps.memberSenior(member_id)
    } catch (err) {
      console.error('call-now: could not look up the member', (err as Error).message)
      return Response.json({ error: 'Could not start the call' }, { status: 500 })
    }
    // Same answer for an unknown member and a stranger's elder, so ids can't be probed.
    if (memberSenior !== senior_id) return Response.json({ error: 'Not allowed to call this person' }, { status: 403 })

    const now = deps.now()
    let claim: { previous: string | null } | false
    try {
      claim = await deps.claimCall(senior_id, now, new Date(now.getTime() - COOLDOWN_MS))
    } catch (err) {
      console.error('call-now: could not claim the call', (err as Error).message)
      return Response.json({ error: 'Could not start the call' }, { status: 500 })
    }
    if (claim === false) {
      return Response.json(
        { error: 'Sodalis called a few minutes ago. Please wait a little before calling again.' },
        { status: 429, headers: { 'Retry-After': String(COOLDOWN_MS / 1000) } },
      )
    }

    try {
      const senior = await deps.loadSenior(senior_id, now)
      const call = await deps.startCall(deps.vapi, senior)
      return Response.json({ ok: true, call_id: call.id })
    } catch (err) {
      console.error('call-now: the call did not start', (err as Error).message)
      try {
        await deps.releaseCall(senior_id, claim.previous)
      } catch (releaseErr) {
        console.error('call-now: could not release the claim', (releaseErr as Error).message)
      }
      return Response.json({ error: 'Sodalis could not place the call. Please try again.' }, { status: 502 })
    }
  }
}
