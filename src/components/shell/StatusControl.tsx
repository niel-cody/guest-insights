"use client";

import { useState, useTransition } from "react";
import { updateStatus } from "@/app/board-actions";
import { STATUSES, STATUS_DOT, STATUS_LABEL, type Status } from "@/lib/status";
import { refreshBoard, useBoard } from "./useBoard";
import { Popover } from "@/components/ui/Popover";

/**
 * Where this page has got to: one dot, beside the title.
 *
 * ── It was a chip, and the chip was in the way ─────────────────────────────
 *
 * It shipped as a bordered pill reading `State · Reviewing ⌄`, in the header's
 * right-hand cluster beside the check register and the coverage chip. Two
 * things were wrong with that.
 *
 * **It was loud for what it is.** Those neighbours qualify the *figures* — they
 * are the difference between a number you can quote and one you cannot, and
 * they earn their weight. This is a note about how far *we* have got building
 * the page, which is scaffolding: real, worth showing, and not something that
 * should compete with the report for a reader's attention every time they land.
 *
 * **It was in the wrong cluster.** The right-hand group is about the data. The
 * page's own build state belongs with the page's own identity, so it sits next
 * to the title and the section label instead, where it reads as part of what
 * this page *is* rather than as another caveat on what it says.
 *
 * ── A dot means colour is the whole signal ─────────────────────────────────
 *
 * There is no label to fall back on, so the states have to be distinguishable
 * at eight pixels — see `STATUS_DOT` for why `todo` and `done` are separated by
 * fill rather than hue. The label is still reachable: it is the accessible name
 * and the tooltip, so a screen reader gets a sentence rather than a bullet, and
 * anybody unsure hovers once.
 *
 * ── It dismisses when you leave it ─────────────────────────────────────────
 *
 * It did not, at first. This was a bare `<details>`, which handles open state
 * and nothing else — no light dismiss, no Escape — so the menu stayed open
 * through clicks on the report behind it and through navigation. See `Popover`,
 * which now carries that for all three floating menus in the shell.
 *
 * ── The rule is still server-side ──────────────────────────────────────────
 *
 * A viewer gets a dot with no menu. That is presentation — `updateStatus`
 * re-checks the session on every call, because a Server Action is a public POST
 * reachable by its own id without ever loading the page that draws this.
 */
function Dot({ state }: { state: Status }) {
  const { color, hollow } = STATUS_DOT[state];
  return (
    <span
      data-status-dot={state}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={
        hollow
          ? { border: `1.5px solid ${color}`, background: "transparent" }
          : { background: color }
      }
    />
  );
}

export function StatusControl({ surface }: { surface: string }) {
  const board = useBoard();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current: Status = board.statuses[surface]?.status ?? "todo";
  const label = `State: ${STATUS_LABEL[current]}`;

  /**
   * A viewer sees nothing at all on `todo`.
   *
   * Deliberately not a grey dot on every page they open. "Nobody has moved this
   * yet" is information for whoever is doing the moving; to a merchant reviewer
   * it is a permanent unexplained mark. The states that *do* say something to
   * them — in progress, reviewing — still show, because knowing a page is
   * half-built is what stops somebody filing careful notes against it.
   */
  if (!board.staff) {
    return current === "todo" ? null : (
      <span title={label} aria-label={label} className="inline-flex items-center">
        <Dot state={current} />
      </span>
    );
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
      // one; on failure it snaps back to what is actually stored rather than
      // sitting on an optimistic value that never landed.
      await refreshBoard();
    });
  }

  return (
    <Popover
      label={label}
      className="relative inline-flex"
      closeOnSelect
      summary={
        <span
          className={`rounded-full p-1 hover:bg-surface-hover ${pending ? "opacity-50" : ""}`}
        >
          <Dot state={current} />
        </span>
      }
      panelClassName="absolute top-full left-0 z-30 mt-1 w-[190px] rounded-xl border border-line bg-surface-raised p-2 shadow-pop"
    >
      <p className="px-2.5 pt-1 pb-1.5 text-[11px] tracking-wide text-ink-muted uppercase">
        Page state
      </p>
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => set(s)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${
            s === current
              ? "bg-accent-soft font-semibold text-accent"
              : "text-ink-secondary hover:bg-surface-hover"
          }`}
        >
          <Dot state={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
      {error && (
        <p
          className="mt-1 border-t border-line px-2.5 pt-2 text-[12px]"
          style={{ color: "var(--critical)" }}
        >
          {error}
        </p>
      )}
    </Popover>
  );
}
