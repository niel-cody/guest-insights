"use client";

import { useState, useTransition } from "react";
import { updateStatus } from "@/app/board-actions";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/status";
import { IconChevron } from "./Icons";
import { StatusChip } from "./StatusChip";
import { refreshBoard, useBoard } from "./useBoard";

/**
 * Where this page has got to, and the way to move it.
 *
 * ── It renders for staff only, and that is presentation ────────────────────
 *
 * The rule lives in `updateStatus`, which re-checks the session on every call.
 * A Server Action is a public POST reachable by its own id without ever loading
 * the page that draws its button, so hiding this control is a courtesy to the
 * reader rather than a boundary. Anything relying on the button being absent is
 * relying on the wrong thing.
 *
 * ── A viewer sees the state, and cannot move it ────────────────────────────
 *
 * Deliberately not hidden entirely from a merchant reviewer. "This page is in
 * review" is exactly the context that stops somebody filing careful notes
 * against a surface that is half-built, which is the cheapest kind of wasted
 * feedback there is.
 */
export function StatusControl({ surface }: { surface: string }) {
  const board = useBoard();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current: Status = board.statuses[surface]?.status ?? "todo";

  if (!board.staff) {
    // Silent on `todo`, like every chip: a surface nobody has moved has nothing
    // to say, and a permanent "To do" on every page is a permanent apology.
    return current === "todo" ? null : <StatusChip state={current} />;
  }

  function set(next: Status) {
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("surface", surface);
      form.set("status", next);
      const res = await updateStatus(form);
      if (!res.ok) setError(res.error ?? "That did not save.");
      // Refetch either way. On success every chip in the nav moves with this
      // one; on failure the control snaps back to what is actually stored
      // rather than showing an optimistic value that never landed.
      await refreshBoard();
    });
  }

  return (
    <details className="relative">
      <summary
        className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium marker:hidden hover:bg-surface-hover ${
          pending ? "opacity-60" : ""
        }`}
        title="Where this page has got to"
      >
        <span className="text-ink-muted">State</span>
        <span className="text-ink">{STATUS_LABEL[current]}</span>
        <IconChevron className="h-3.5 w-3.5 text-ink-muted" />
      </summary>
      <div className="absolute top-full right-0 z-30 mt-1 w-[190px] rounded-xl border border-line bg-surface-raised p-2 shadow-pop">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set(s)}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
              s === current
                ? "bg-accent-soft font-semibold text-accent"
                : "text-ink-secondary hover:bg-surface-hover"
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
        {error && (
          <p className="mt-1 border-t border-line px-2.5 pt-2 text-[12px]" style={{ color: "var(--critical)" }}>
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
