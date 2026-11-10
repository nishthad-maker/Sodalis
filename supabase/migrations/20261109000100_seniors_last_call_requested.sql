-- last_call_requested_at: when a family member last pressed "Call now" (POST /api/hope/call-now).
-- The route claims the call with one conditional UPDATE, so two presses on two servers can't both
-- start a call, and nobody can make the elder's phone ring more than once every few minutes.
-- Not sensitive: the anon key may read it, like the rest of seniors.

alter table seniors add column if not exists last_call_requested_at timestamptz;
