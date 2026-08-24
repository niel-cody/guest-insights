"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/board-actions";
import {
  SENTIMENTS, SENTIMENT_HINT, SENTIMENT_LABEL, type Sentiment,
} from "@/lib/status";
import { IconX } from "./Icons";

/**
 * The way a reader says something, from the page they are saying it about.
 *
 * ── Why it captures the path instead of asking ─────────────────────────────
 *
 * The single most common way review feedback becomes unusable is that it
 * arrives detached from what it was about: "the retention chart looks wrong" in
 * a message, three weeks later, against a page that has moved twice since. The
 * form takes the pathname **and the query string** without asking, because a
 * report read with three filters applied is a different view from the same
 * report unfiltered, and the reader has no reason to know that matters.
 *
 * ── Four kinds, not a thumbs up ────────────────────────────────────────────
 *
 * A like/dislike pair produces a score and nothing anybody can act on. These
 * four name the kind of problem, and the kind decides who fixes it: "confusing"
 * is a design fault and "wrong" is a data fault, and they go to different
 * people. `idea` exists so requests stop arriving disguised as defects.
 *
 * ── It never says thank you and closes ─────────────────────────────────────
 *
 * On success the panel stays open and says what was recorded, including the
 * path. A reviewer who cannot see that their note landed writes it again, or
 * worse, stops writing them.
 */
export function Feedback({
  surface, orgSlug, period,
}: {
  surface: string;
  orgSlug: string;
  period: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [body, setBody] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const qs = search.toString();
  const path = qs ? `${pathname}?${qs}` : pathname;

  function send() {
    if (!sentiment || !body.trim()) return;
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("surface", surface);
      form.set("path", path);
      form.set("orgSlug", orgSlug);
      form.set("period", period);
      form.set("sentiment", sentiment);
      form.set("body", body);
      const res = await submitFeedback(form);
      if (!res.ok) {
        setError(res.error ?? "That did not send.");
        return;
      }
      setDone(path);
      setBody("");
      setSentiment(null);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setDone(null); }}
        className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-secondary hover:bg-surface-hover"
      >
        Give feedback
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent"
      >
        Give feedback
      </button>

      <div className="absolute top-full right-0 z-40 mt-1 w-[380px] rounded-xl border border-line bg-surface-raised shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">What do you make of this page?</h2>
            {/* The reader is shown exactly what will be recorded. Feedback
                attached to a path they cannot see is feedback they cannot
                correct if it is attached to the wrong thing. */}
            <p className="mt-0.5 font-mono text-[11px] break-all text-ink-muted">{path}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="shrink-0 text-ink-muted hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {SENTIMENTS.map((s) => (
              <button
                key={s}
                type="button"
                title={SENTIMENT_HINT[s]}
                onClick={() => setSentiment(s)}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${
                  sentiment === s
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-ink-secondary hover:bg-surface-hover"
                }`}
              >
                {SENTIMENT_LABEL[s]}
              </button>
            ))}
          </div>

          {sentiment && (
            <p className="text-[12px] leading-relaxed text-ink-muted">{SENTIMENT_HINT[sentiment]}</p>
          )}

          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="What did you expect, and what did you get?"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
          />

          {error && (
            <p className="text-[12px]" style={{ color: "var(--critical)" }}>{error}</p>
          )}
          {done && (
            <p className="text-[12px]" style={{ color: "var(--good)" }}>
              Recorded against {done}. Leave another if you have one.
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-muted">
              Goes to the Oolio team with your organisation and this page attached.
            </p>
            <button
              type="button"
              disabled={pending || !sentiment || !body.trim()}
              onClick={send}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
