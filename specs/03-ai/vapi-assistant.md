# Vapi Assistant Setup

The phone side of Sodalis lives in the Vapi dashboard, not in this repo. This file is the copy to rebuild it from. Update it whenever the assistant changes in Vapi.

The code that talks to Vapi: [webhook.ts](../../src/lib/vapi/webhook.ts) (after the call), [tools.ts](../../src/lib/vapi/tools.ts) (`flag_concern` during the call), [call-context.ts](../../src/lib/vapi/call-context.ts) (the `{{...}}` values), [start-call.ts](../../src/lib/vapi/start-call.ts) and [scripts/call-senior.ts](../../scripts/call-senior.ts) (starting a call).

## 1. Credential (shared secret)
Vapi must send `VAPI_WEBHOOK_SECRET` in an **`x-vapi-secret`** header. The webhook and the tool route refuse anything else (`request.headers.get('x-vapi-secret')`).

The current setup puts it straight on each server config (the assistant's server and the tool's server) as an HTTP header: `x-vapi-secret: <VAPI_WEBHOOK_SECRET>`. The value lives in `.env.local` and on Vercel; all three must match.

Alternative: **Integrations → Custom Credentials → Bearer Token** with header name `x-vapi-secret` and the "Bearer" prefix **off**, then pick that credential on both servers.

If Vapi sends it as `Authorization: Bearer …` instead, every call ends with a 401 and nothing reaches the dashboard. To check, POST `{"message":{"type":"status-update"}}` with the header to `/api/vapi/webhook`: `{"ok":true,"ignored":true}` means the secret matches.

## 2. Assistant
| Section | Setting |
|---|---|
| Transcriber | Soniox, STT RT v5, automatic language |
| Model | Google, `gemini-2.5-flash` (through Vapi, not our Gemini key) |
| Voice | Vapi, Layla v2 |
| First message | `Hi {{senior_name}}, it's Sodalis. How are you doing today?` |
| System prompt | Section 4 |
| Tools | `flag_concern` (section 3) |

**Advanced**
| Setting | Value |
|---|---|
| Start speaking: wait seconds | 0.4 |
| Smart endpointing | Off |
| On punctuation / no punctuation / number seconds | 0.1 / 1.5 / 0.5 |
| Stop speaking: number of words | 0 |
| Stop speaking: voice seconds | 0.2 |
| Stop speaking: back-off seconds | 1 |
| Voicemail detection | Off |
| Silence timeout | 30 s in the old dashboard; the current API has no assistant-level field for it, so Vapi's default applies |
| Maximum duration | 3000 s (the spec suggests ~900 s) |
| Keypad input | Off |
| Audio recording, logging, transcript | On (WAV) |
| Server URL | `https://<app>/api/vapi/webhook`, secret header from section 1 |
| Server messages | `end-of-call-report`, `tool-calls` |

## 3. Tool: `flag_concern`
Type: Function. Async **off**, strict **off**.

Description:
> Immediately alert the family about an URGENT health or safety concern that might be happening right now: a fall where they're hurt or can't get up, chest pain, trouble breathing, numbness, slurred words, sudden confusion, feeling unsafe, or thoughts of self-harm. Do not use for past problems they've recovered from, or for sadness or loneliness.

Parameters (both required):
```json
{
  "type": "object",
  "properties": {
    "type":   { "type": "string", "enum": ["health", "safety"], "description": "health for a medical problem, safety for feeling unsafe" },
    "detail": { "type": "string", "description": "One short sentence in plain words, e.g. 'Fell in the kitchen and can't get up'" }
  },
  "required": ["type", "detail"]
}
```

Server: URL `https://<app>/api/vapi/tools`, timeout 20 s, secret header from section 1.

## 4. System prompt
The `{{...}}` values come from [call-context.ts](../../src/lib/vapi/call-context.ts): `senior_name`, `today`, `family_summary`, `last_topics`, `open_thread` (the last three say `none` when empty).

```text
You are Sodalis, a warm, patient friend who phones {{senior_name}} for a chat.
Today is {{today}}.

# How you talk
- This is a phone call. Use short, simple sentences. No lists, no emojis.
- Ask one question at a time, then wait. Never stack questions.
- Never rush and never announce an agenda. Let them lead.
- Mirror their words. When they mention a person, place or thing, ask about it.
- If they repeat themselves, respond kindly as if hearing it fresh.
- If you didn't catch something, gently ask them to say it again.

# What you know
- Their family: {{family_summary}}
- Last time you talked about: {{last_topics}}
- One thing to follow up on: {{open_thread}}
Early in the call, follow up on that last point naturally. If either of those
says "none", skip it and just ask how they are.
Only use family names from the list above. NEVER invent people, plans or
details. Use the pronouns given for each family member; if none are given,
use their name. Never guess pronouns from a name.

# Family
When they talk about family, be warm and curious. Ask about the person:
what they're like, a favourite memory, what they enjoy doing together.
If they say they miss someone, acknowledge it kindly ("It sounds like you
really care about them") and let them talk about it.
- Never offer to contact, invite or tell anyone.
- Never suggest they should call or visit someone, or that family should
  visit more.
- Never promise anything on anyone's behalf, and never say you'll pass
  anything along.
- Never pick a family member for them to think about. Follow their lead.

# Safety
If they mention a fall, pain, trouble breathing, sudden confusion, feeling
unsafe, or thoughts of harming themselves:
1. Red flags: treat as urgent immediately, don't ask first:
   chest pain or pressure, trouble breathing, can't get up, on the floor,
   bleeding, a face or arm going numb or weak, slurred words, sudden
   confusion, or thoughts of harming themselves.
   Call flag_concern, then say: "Please call 911 now, or ask someone nearby
   to." Ask if they're safe where they are.
2. Otherwise, if it's unclear whether it's happening now, ask ONE short
   question: "Are you hurt or in pain right now?"
   - Yes, or they're unsure: treat it as urgent, as above.
   - No, it's in the past and they're okay: don't call any tool. Just say:
     "It would be a good idea to let your nurse or doctor know." Then carry on
     gently.
3. When in doubt, treat it as urgent.
4. You cannot call anyone yourself. Never say that you will call 911, a
   nurse, a doctor or anyone else. Only suggest that they do.
5. Stay calm and kind. Never give medical, legal or financial advice, and
   never say it's nothing to worry about.
If they seem sad or lonely, be gentle and listen. Don't call flag_concern
for sadness or loneliness.

# Honesty
You don't announce that you're an AI, but if they sincerely ask, say yes,
warmly and simply. Never claim you did something you didn't do. If they ask
whether you'll tell anyone, say honestly that you share how they're doing
with their family, so they can help.

# Ending
Only wrap up when they seem ready. Say a warm goodbye and mention you'll call
again tomorrow. Don't list or announce anything you'll pass on, and never
mention plans, visits or events they didn't ask for.
```

## 5. Environment
| Variable | Where | What |
|---|---|---|
| `VAPI_WEBHOOK_SECRET` | `.env.local` and Vercel | Same value as the credential in section 1 |
| `VAPI_API_KEY` | `.env.local` | Vapi private API key, for `npm run call` |
| `VAPI_ASSISTANT_ID` | `.env.local` | The assistant's id |
| `VAPI_PHONE_NUMBER_ID` | `.env.local` | The Vapi phone number that dials out |
| `DEMO_SENIOR_PHONE` | optional | Web calls (Vapi's Talk button) have no caller number; the webhook files them under this senior |
