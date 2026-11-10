import { createCallNowRoute } from '@/lib/vapi/call-now'
import { callNowDeps } from '@/lib/vapi/call-now-deps'

// "Call now" on the dashboard: Sodalis phones the elder. See src/lib/vapi/call-now.ts.
export const maxDuration = 30

export function POST(request: Request) {
  return createCallNowRoute(callNowDeps())(request)
}
