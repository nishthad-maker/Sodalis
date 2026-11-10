# Sodalis: Family Connection AI Specs

Next.js PWA (Vercel) + Supabase + Vapi + Gemini Flash + Firebase Cloud Messaging.
"Hope" phones an isolated senior, Gemini extracts mood/topics/engagement/flags, the family dashboard updates live, and a scheduler proposes family visits/calls and Hope's own check-in calls.

| Folder | Contents |
|---|---|
| [01-database](01-database/schema.md) | Tables, indexes, realtime, security |
| [02-api](02-api/routes.md) | Route map and Vapi webhook flow |
| [03-ai](03-ai/hope-persona.md) | Hope persona, Gemini extraction schema |
| [03-ai](03-ai/vapi-assistant.md) | Vapi dashboard setup to rebuild the assistant: prompt, tool, credential, settings |
| [04-scheduler](04-scheduler/algorithm.md) | Slot matching and greedy scoring |
| [05-product](05-product/decisions.md) | Decisions, scope, build order, risks |
| [06-notifications](06-notifications/conversation-to-visit.md) | How conversations become visit notifications |
| [07-onboarding](07-onboarding/family-linking.md) | Linking family to the elder by phone number |
| [07-onboarding](07-onboarding/member-questionnaire.md) | Family member interest questionnaire and matching profile |
| [08-agents](08-agents/hope-tools.md) | Hope's in-call health alert (`flag_concern`) and the coordinator |
| [08-agents](08-agents/coordinator-agent.md) | Gemini coordinator agent that turns opportunities into family pushes |
| [06-notifications](06-notifications/conversation-to-visit.md#event-planner-implementation) | Event planner: post-call Gemini extraction of opportunities |
| [03-ai](03-ai/hope-persona.md#wellbeing-alerts) | Wellbeing alerts: post-call Gemini extraction of loneliness, mood, falls and daily-living concerns |
| [10-calendar](10-calendar/google-calendar-import.md) | Google Calendar `.ics` / `.zip` import: parsing, UTC normalization, RRULE handling |

**Scope:** v1 is the 12-hour build; v2 is stretch. The split is in [decisions](05-product/decisions.md#scope-v1-vs-v2).

Source of truth: the approved plan from the planning session. Update these files if decisions change.
