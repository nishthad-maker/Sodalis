"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getSession } from "@/lib/session";
import AlertCard, { type Alert } from "./AlertCard";
import InviteCard from "./InviteCard";
import { isPushConfigured } from "@/lib/firebase/config";
import NotificationsButton from "./NotificationsButton";
import CallNowButton from "./CallNowButton";
import { MOOD_COLORS, MoodFace, MoodGlyph, moodLevel } from "./MoodFace";
import { Avatar, Screen, TabBar } from "./ui";

type CheckIn = {
  id: string;
  started_at: string;
  status: string;
  summary: string | null;
  mood_score: number | null;
  mood_label: string | null;
  topics: string[] | null;
  engagement_score: number | null;
};
// An open 'wants_contact' opportunity: the elder would love to hear from family.
type ContactRequest = { id: string; summary: string; created_at: string };
type Idea = { id: string; type: string; summary: string; quote: string | null; status: string; accepted_by: string | null; created_at: string };
type Visit = { id: string; kind: "visit" | "call"; starts_at: string; status: string };

const TABLES = ["check_ins", "alerts", "visits", "opportunities"] as const;
const RANK = { urgent: 0, warn: 1, info: 2 } as const;

function when(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `Today, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

function Trend({ points }: { points: { score: number; date: Date }[] }) {
  if (points.length < 2) return null;
  // Each day is its own small mood face on the line; today's is a little bigger.
  const W = 300, H = 96, pad = 22, top = 14, base = 62;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (s: number) => top + ((1 - s) / 2) * (base - top);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.score)}`).join(" ");
  const today = new Date().toDateString();
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 w-full" role="img" aria-label="Mood over recent calls">
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => {
        const isToday = p.date.toDateString() === today;
        return (
          <g key={i}>
            <MoodDot cx={x(i)} cy={y(p.score)} score={p.score} big={isToday} />
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fontWeight={isToday ? 700 : 400} fill={isToday ? "var(--color-ink)" : "var(--color-slate)"}>
              {isToday ? "Today" : p.date.toLocaleDateString(undefined, { weekday: "short" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MoodDot({ cx, cy, score, big }: { cx: number; cy: number; score: number; big: boolean }) {
  const level = moodLevel(score);
  const c = MOOD_COLORS[level];
  const r = big ? 11 : 9;
  const s = (r * 2) / 24; // the 24-unit face scaled to fill the circle
  return (
    <g>
      <title>{c.label}</title>
      <circle cx={cx} cy={cy} r={r} fill={c.bg} stroke={c.fg} strokeWidth={big ? 2 : 1.4} />
      <g transform={`translate(${cx - r} ${cy - r}) scale(${s})`} color={c.fg} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <MoodGlyph level={level} />
      </g>
    </g>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState("");
  const [memberId, setMemberId] = useState("");
  const [seniorId, setSeniorId] = useState("");
  const [seniorName, setSeniorName] = useState("");
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);

  // Ideas and contact requests show only to the member the coordinator picked (notified_member_ids), the
  // best match, not to the whole family.
  const load = useCallback(async (id: string, member: string) => {
    const db = supabaseBrowser();
    const [s, c, a, r, v, o, m] = await Promise.all([
      db.from("seniors").select("name").eq("id", id).maybeSingle(),
      db.from("check_ins").select("id, started_at, status, summary, mood_score, mood_label, topics, engagement_score")
        .eq("senior_id", id).order("started_at", { ascending: false }).limit(14),
      db.from("alerts").select("id, type, severity, message, created_at, check_in_id")
        .eq("senior_id", id).is("acknowledged_by", null).order("created_at", { ascending: false }).limit(10),
      db.from("opportunities").select("id, summary, created_at")
        .eq("senior_id", id).eq("type", "wants_contact").in("status", ["detected", "proposed"]).contains("notified_member_ids", [member])
        .order("created_at", { ascending: false }),
      // "Next up" is this member's own visits only, like the calendar.
      db.from("visits").select("id, kind, starts_at, status")
        .eq("senior_id", id).eq("member_id", member).in("status", ["proposed", "confirmed"]).gte("starts_at", new Date().toISOString())
        .order("starts_at").limit(10),
      db.from("opportunities").select("id, type, summary, quote, status, accepted_by, created_at")
        .eq("senior_id", id).neq("type", "wants_contact").in("status", ["proposed", "confirmed"]).contains("notified_member_ids", [member]).order("created_at", { ascending: false }).limit(5),
      db.from("family_members").select("id, name").eq("senior_id", id),
    ]);
    if (s.error || c.error) return setError("Couldn't load the dashboard.");
    setError("");
    setSeniorName(s.data?.name?.split(" ")[0] ?? "");
    setCheckIns((c.data ?? []) as CheckIn[]);
    setAlerts(((a.data ?? []) as Alert[]).sort((x, y) => RANK[x.severity] - RANK[y.severity]));
    setRequests((r.data ?? []) as ContactRequest[]);
    setVisits((v.data ?? []) as Visit[]);
    setIdeas((o.data ?? []) as Idea[]);
    setNames(Object.fromEntries((m.data ?? []).map((x) => [x.id, x.name.split(" ")[0]])));
    setLoaded(true);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) return void router.replace("/");
    queueMicrotask(() => {
      setMe(s.name ?? "");
      setMemberId(s.member_id);
      setSeniorId(s.senior_id);
    });
    let db: ReturnType<typeof supabaseBrowser>;
    try {
      db = supabaseBrowser();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not initialize the Supabase client.";
      return void queueMicrotask(() => setError(message));
    }
    queueMicrotask(() => load(s.senior_id, s.member_id));
    // Any change to these tables for this senior triggers a refetch.
    const channel = db.channel(`senior-${s.senior_id}`);
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `senior_id=eq.${s.senior_id}` }, () => load(s.senior_id, s.member_id));
    }
    channel.subscribe();
    return () => void db.removeChannel(channel);
  }, [router, load]);

  const completed = checkIns.filter((c) => c.status === "completed");
  const latest = completed[0];
  const trend = completed
    .filter((c) => c.mood_score != null)
    .slice(0, 7)
    .reverse()
    .map((c) => ({ score: c.mood_score as number, date: new Date(c.started_at) }));
  const first = me.split(" ")[0];
  const sName = seniorName || "your loved one";

  if (error) return <p role="alert" className="p-8 text-danger">{error}</p>;
  if (!loaded) return <p className="p-8 text-slate">Loading…</p>;

  const card = "rounded-3xl border border-sand bg-white p-5";

  return (
    <Screen tabs={<TabBar active="home" name={first} />}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate">{first ? `${greeting()}, ${first}` : greeting()}</p>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-ink">Here&apos;s how {sName} is</h1>
        </div>
        <button aria-label="Switch or add profile" onClick={() => router.push("/profiles")}>
          <Avatar name={me || "?"} />
        </button>
      </header>

      <div className="mt-6 space-y-4">
        {/* Hidden until Firebase is set up, so a missing setting never breaks the page. */}
        {isPushConfigured() && <NotificationsButton memberId={memberId || null} />}

        {seniorId && memberId && <CallNowButton seniorId={seniorId} memberId={memberId} name={sName} />}

        {alerts.length > 0 && (
          <section aria-label="Alerts" className="space-y-3">
            {/* The most important alert is the large card; the rest are compact. */}
            {alerts.map((a, i) => (
              <AlertCard
                key={a.id}
                alert={a}
                memberId={memberId}
                time={when(a.created_at)}
                prominent={i === 0}
                onDismissed={(id) => setAlerts((list) => list.filter((x) => x.id !== id))}
              />
            ))}
          </section>
        )}

        {requests.length > 0 && (
          <section className="space-y-3">
            {requests.map((r) => (
              <Link key={r.id} href={`/opportunities/${r.id}`} className="flex items-start gap-3 rounded-3xl border border-primary/20 bg-mist p-5 transition-colors hover:bg-btn/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-primary">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-semibold text-primary">Call request · {when(r.created_at)}</p>
                  <p className="mt-1 text-lg font-semibold leading-snug text-ink">{r.summary}</p>
                </div>
              </Link>
            ))}
          </section>
        )}

        <section className={card}>
          <p className="text-sm font-medium text-slate">{sName}&apos;s mood today</p>
          {latest ? (
            <>
              <div className="mt-3 flex items-center gap-4">
                <MoodFace score={latest.mood_score} />
                <div>
                  <p className="font-serif text-3xl font-semibold text-ink first-letter:uppercase">{latest.mood_label ?? "Mood unknown"}</p>
                  {latest.engagement_score != null && (
                    <p className="text-slate">Engaged {Math.round(latest.engagement_score * 100)}% on the last call</p>
                  )}
                </div>
              </div>
              <Trend points={trend} />
              <p className="mt-2 border-t border-sand pt-3 text-sm text-slate">From the call · {when(latest.started_at)}</p>
            </>
          ) : (
            <p className="mt-2 text-slate">No calls yet. Sodalis&apos;s first summary will show up here.</p>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-semibold text-ink">Next up</h2>
            <Link href="/schedule" className="text-sm font-semibold text-primary hover:underline">Calendar</Link>
          </div>
          {visits[0] ? (
            <div className={`${card} flex items-center justify-between py-4`}>
              <div>
                <p className="font-semibold text-ink">
                  <span className="capitalize">{visits[0].kind}</span> · {when(visits[0].starts_at)}
                </p>
                {visits.length > 1 && <p className="text-sm text-slate">and {visits.length - 1} more coming up</p>}
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${visits[0].status === "confirmed" ? "bg-mist text-primary-dark" : "bg-warn-bg text-warn"}`}>
                {visits[0].status === "confirmed" ? "Confirmed" : "Waiting"}
              </span>
            </div>
          ) : (
            <p className="text-slate">Nothing scheduled yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-semibold text-ink">Last call with Sodalis</h2>
          {checkIns[0] ? (
            <>
              <Link href={`/calls/${checkIns[0].id}`} className={`${card} block space-y-2 transition-colors hover:bg-cream`}>
                <div className="flex items-center justify-between text-sm text-slate">
                  <span>{when(checkIns[0].started_at)}</span>
                  <span className="font-semibold capitalize">
                    {checkIns[0].status === "completed" ? checkIns[0].mood_label ?? "" : checkIns[0].status.replace("_", " ")}
                  </span>
                </div>
                {checkIns[0].summary && <p className="leading-relaxed text-ink">{checkIns[0].summary}</p>}
                {!!checkIns[0].topics?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {checkIns[0].topics.map((t) => (
                      <span key={t} className="rounded-full bg-mist px-3 py-1 text-sm text-primary-dark">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
              {checkIns.length > 1 && (
                <button type="button" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)} className="text-sm font-semibold text-primary hover:underline">
                  {showEarlier ? "Hide earlier calls" : "Show earlier calls"}
                </button>
              )}
              {showEarlier &&
                checkIns.slice(1).map((c) => (
                  <Link key={c.id} href={`/calls/${c.id}`} className={`${card} block space-y-2 transition-colors hover:bg-cream`}>
                <div className="flex items-center justify-between text-sm text-slate">
                  <span>{when(c.started_at)}</span>
                  <span className="font-semibold capitalize">
                    {c.status === "completed" ? c.mood_label ?? "" : c.status.replace("_", " ")}
                  </span>
                </div>
                {c.summary && <p className="leading-relaxed text-ink">{c.summary}</p>}
                {!!c.topics?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.topics.map((t) => (
                      <span key={t} className="rounded-full bg-mist px-3 py-1 text-sm text-primary-dark">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
                ))}
            </>
          ) : (
            <p className="text-slate">Nothing yet.</p>
          )}
        </section>

        {ideas.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-semibold text-ink">Ideas from Sodalis&apos;s calls</h2>
            {ideas.map((i) => (
              <Link key={i.id} href={`/opportunities/${i.id}`} className={`${card} block space-y-2 transition-colors hover:bg-cream`}>
                {i.quote && <p className="font-serif text-lg leading-snug text-ink">&ldquo;{i.quote}&rdquo;</p>}
                <p className="text-slate">{i.summary}</p>
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${i.status === "confirmed" ? "bg-mist text-primary-dark" : "bg-peach text-accent"}`}>
                  {i.status === "confirmed" ? `${i.accepted_by ? names[i.accepted_by] ?? "Someone" : "Someone"} is on it` : "Needs someone"}
                </span>
              </Link>
            ))}
          </section>
        )}

        {memberId && <InviteCard memberId={memberId} seniorName={sName} />}
      </div>
    </Screen>
  );
}
