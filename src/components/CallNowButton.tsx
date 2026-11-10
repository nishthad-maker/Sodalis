"use client";

import { useState } from "react";
import { Button } from "./ui";

type State = "idle" | "confirm" | "calling" | "started" | "error";

// Asks Sodalis to phone the elder now. A real phone rings, so it takes a second tap to confirm.
export default function CallNowButton({ seniorId, memberId, name }: { seniorId: string; memberId: string; name: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function call() {
    setState("calling");
    try {
      const res = await fetch("/api/hope/call-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senior_id: seniorId, member_id: memberId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Sodalis couldn't place the call. Please try again.");
        return setState("error");
      }
      setState("started");
    } catch {
      setMessage("Couldn't reach Sodalis. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "started")
    return (
      <p role="status" className="rounded-3xl border border-sand bg-white p-5 text-slate">
        Sodalis is calling {name} now. The summary will show up here after the call.
      </p>
    );

  if (state === "confirm" || state === "calling")
    return (
      <div className="space-y-3 rounded-3xl border border-sand bg-white p-5">
        <p className="text-ink">Sodalis will phone {name} right now. Go ahead?</p>
        <div className="flex gap-3">
          <Button type="button" className="flex-1" disabled={state === "calling"} onClick={() => void call()}>
            {state === "calling" ? "Calling…" : "Call now"}
          </Button>
          <Button type="button" variant="secondary" className="flex-1" disabled={state === "calling"} onClick={() => setState("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className="w-full" onClick={() => setState("confirm")}>
        Have Sodalis call {name}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-red-800">{message}</p>
      )}
    </div>
  );
}
