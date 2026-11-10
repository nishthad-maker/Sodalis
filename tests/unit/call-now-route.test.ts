import { describe, expect, it, vi } from 'vitest'
import { callRoute } from '../helpers/route'
import { COOLDOWN_MS, createCallNowRoute, type CallNowDeps } from '@/lib/vapi/call-now'

// POST /api/hope/call-now: a family member asks Sodalis to phone their elder now.

const SENIOR = '3f2b8c1e-6a4d-4e0b-9c55-1d2e3f4a5b6c'
const MEMBER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const OTHER_SENIOR = '11111111-2222-4333-8444-555555555555'
const NOW = new Date('2026-11-09T18:00:00Z')
const VAPI = { apiKey: 'key', assistantId: 'asst', phoneNumberId: 'num' }
const SENIOR_TO_CALL = {
  id: SENIOR,
  name: 'Jane',
  phone_e164: '+14165550142',
  variables: { senior_name: 'Jane', today: 'Monday, November 9', family_summary: 'none', last_topics: 'none', open_thread: 'none' },
}

function setup(over: Partial<CallNowDeps> = {}) {
  const deps: CallNowDeps = {
    vapi: VAPI,
    memberSenior: vi.fn().mockResolvedValue(SENIOR),
    claimCall: vi.fn().mockResolvedValue({ previous: null }),
    releaseCall: vi.fn().mockResolvedValue(undefined),
    loadSenior: vi.fn().mockResolvedValue(SENIOR_TO_CALL),
    startCall: vi.fn().mockResolvedValue({ id: 'call-123' }),
    now: () => NOW,
    ...over,
  }
  const post = (body: unknown) => callRoute(createCallNowRoute(deps), '/api/hope/call-now', { body })
  return { deps, post }
}

describe('POST /api/hope/call-now', () => {
  it('claims the call, then phones the elder with their call variables', async () => {
    const { deps, post } = setup()

    const res = await post({ senior_id: SENIOR, member_id: MEMBER })

    expect(res.status).toBe(200)
    expect(res.json).toEqual({ ok: true, call_id: 'call-123' })
    expect(deps.claimCall).toHaveBeenCalledWith(SENIOR, NOW, new Date(NOW.getTime() - COOLDOWN_MS))
    expect(deps.startCall).toHaveBeenCalledWith(VAPI, SENIOR_TO_CALL)
    expect(deps.releaseCall).not.toHaveBeenCalled()
  })

  it.each([
    ['no body', undefined],
    ['no ids', {}],
    ['a senior_id that is not a UUID', { senior_id: 'jane', member_id: MEMBER }],
    ['a member_id that is not a UUID', { senior_id: SENIOR, member_id: 7 }],
  ])('returns 400 for %s without calling anyone', async (_name, body) => {
    const { deps, post } = setup()
    expect((await post(body)).status).toBe(400)
    expect(deps.startCall).not.toHaveBeenCalled()
  })

  it('returns 503 when Vapi is not configured', async () => {
    const { deps, post } = setup({ vapi: null })
    expect((await post({ senior_id: SENIOR, member_id: MEMBER })).status).toBe(503)
    expect(deps.claimCall).not.toHaveBeenCalled()
  })

  it.each([
    ['an unknown member', null],
    ['a member of a different family', OTHER_SENIOR],
  ])('refuses %s with 403 and no claim', async (_name, memberSenior) => {
    const { deps, post } = setup({ memberSenior: vi.fn().mockResolvedValue(memberSenior) })
    expect((await post({ senior_id: SENIOR, member_id: MEMBER })).status).toBe(403)
    expect(deps.claimCall).not.toHaveBeenCalled()
    expect(deps.startCall).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After when the elder was called in the last few minutes', async () => {
    const { deps, post } = setup({ claimCall: vi.fn().mockResolvedValue(false) })

    const res = await post({ senior_id: SENIOR, member_id: MEMBER })

    expect(res.status).toBe(429)
    expect(res.response.headers.get('Retry-After')).toBe(String(COOLDOWN_MS / 1000))
    expect(deps.startCall).not.toHaveBeenCalled()
  })

  it('puts the claim back when Vapi refuses the call, so the family can retry', async () => {
    const previous = '2026-11-08T10:00:00.000Z'
    const { deps, post } = setup({
      claimCall: vi.fn().mockResolvedValue({ previous }),
      startCall: vi.fn().mockRejectedValue(new Error('Vapi refused the call (HTTP 400)')),
    })

    const res = await post({ senior_id: SENIOR, member_id: MEMBER })

    expect(res.status).toBe(502)
    expect(deps.releaseCall).toHaveBeenCalledWith(SENIOR, previous)
  })

  it('still answers 502 when releasing the claim fails too', async () => {
    const { post } = setup({
      startCall: vi.fn().mockRejectedValue(new Error('down')),
      releaseCall: vi.fn().mockRejectedValue(new Error('db down')),
    })
    expect((await post({ senior_id: SENIOR, member_id: MEMBER })).status).toBe(502)
  })

  it('returns 500 when the member lookup fails', async () => {
    const { deps, post } = setup({ memberSenior: vi.fn().mockRejectedValue(new Error('db down')) })
    expect((await post({ senior_id: SENIOR, member_id: MEMBER })).status).toBe(500)
    expect(deps.startCall).not.toHaveBeenCalled()
  })
})
