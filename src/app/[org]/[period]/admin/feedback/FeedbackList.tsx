"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleResolved } from "@/app/board-actions";
import type { FeedbackRow } from "@/lib/board";
import { SENTIMENT_LABEL, SENTIMENT_TONE } from "@/lib/status";
import { Card, Pill } from "@/components/ui/Primitives";

const TONE: Record<string, "neutral" | "good" | "warning" | "critical"> = {
  quiet: "neutral", good: "good", warning: "warning", accent: "neutral",
};

/**
 * The list, with open notes first and a filter that defaults to open.
 *
 * ── Resolved rather than deleted ───────────────────────────────────────────
 *
 * Nothing here can be removed, by anybody. Feedback that can be quietly deleted
 * is feedback nobody trusts having left, and the resolved flag costs a row and
 * keeps the record. The policy in the database agrees: there is no delete
 * policy on this table for any role.
 */
export function FeedbackList({ rows }: { rows: FeedbackRow[] }) {
  const [showResolved, setShowResolved] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const visible = showResolved ? rows : rows.filter((r) => !r.resolved);

  function toggle(row: FeedbackRow) {
    setPendingId(row.id);
    start(async () => {
      const form = new FormData();
      form.set("id", row.id);
      form.set("resolved", String(!row.resolved));
      await toggleResolved(form);
      setPendingId(null);
    });
  }

  return (
    <Card
      title={showResolved ? "Everything" : "Open notes"}
      subtitle="Newest first. Each one links back to the exact view it was written from."
      padded={false}
      right={
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-[13px] font-medium text-accent hover:underline"
        >
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      }
    >
      {visible.length === 0 ? (
        <p className="p-5 text-[13px] text-ink-secondary">
          Nothing open. {rows.length} resolved.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((r) => (
            <li key={r.id} className={`px-5 py-4 ${r.resolved ? "opacity-55" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <Pill tone={TONE[SENTIMENT_TONE[r.sentiment]]}>
                    {SENTIMENT_LABEL[r.sentiment]}
                  </Pill>
                  <span className="text-[13px] font-semibold text-ink">
                    {r.authorLabel ?? "Unattributed"}
                  </span>
                  {r.orgSlug && <Pill>{r.orgSlug}</Pill>}
                </div>
                <button
                  type="button"
                  disabled={pendingId === r.id}
                  onClick={() => toggle(r)}
                  className="text-[12px] font-medium text-ink-secondary hover:text-ink hover:underline disabled:opacity-50"
                >
                  {r.resolved ? "Reopen" : "Mark resolved"}
                </button>
              </div>

              <p className="mt-2 max-w-[100ch] text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
                {r.body}
              </p>

              {/* The path is a link, not a note. Reading feedback and getting to
                  the thing it is about should not involve retyping a URL. */}
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-muted">
                <Link href={r.path} className="font-mono break-all underline underline-offset-2 hover:text-ink">
                  {r.path}
                </Link>
                <span>·</span>
                <span>{new Date(r.createdAt).toLocaleString("en-AU")}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
