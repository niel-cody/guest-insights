"use client";

import { STATUS_DOT, STATUS_LABEL, type ChipState } from "@/lib/status";

/**
 * The mark beside a nav item, in the one of two forms that fits what it says.
 *
 * ── Why progress is a dot and `existing` is a word ─────────────────────────
 *
 * These answer different questions, and the shape says which. **Progress**
 * answers "how far has this got" — a position on a five-step scale, where the
 * scale itself is the meaning and colour carries it fine. **`existing`**
 * answers "is this ours at all" — a category, not a position, and the one thing
 * a reviewer most needs to know before spending attention on a screen. A grey
 * dot cannot say "this ships in production and we are not touching it".
 *
 * The rule that still holds is one mark per item, not one shape per nav. An
 * item is either a production report or one of ours; it is never both, so
 * nothing here ever draws two.
 *
 * ── Why progress stopped being a word ──────────────────────────────────────
 *
 * It was a filled text chip: `REVIEWING`, `IN PROGRESS`, `APPROVED`. Two things
 * broke. Forty-one items each able to carry a coloured word made the sidebar
 * read as a status board with navigation attached, rather than navigation that
 * happens to know where things stand. And the longer labels pushed item names
 * into ellipsis — "Retention and C…" — which is a navigation aid failing at
 * navigating in order to report on itself.
 *
 * The label survives as the accessible name and the tooltip, so nothing is
 * lost to a screen reader and one hover recovers it for anybody else.
 *
 * ── `todo` still renders nothing ───────────────────────────────────────────
 *
 * On a fresh board every one of the forty-one is `todo`, and forty-one
 * identical marks is not information — it is a column of noise hiding the three
 * that moved. Silence is the default; a mark means something happened.
 */
export function StatusChip({ state }: { state: ChipState }) {
  if (state === "todo") return null;

  const label = STATUS_LABEL[state];

  if (state === "existing") {
    return (
      <span
        data-status-chip="existing"
        className="shrink-0 rounded-full border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-ink-muted uppercase"
      >
        {label}
      </span>
    );
  }

  const { color, hollow } = STATUS_DOT[state];
  return (
    <span
      data-status-chip={state}
      title={label}
      aria-label={label}
      role="img"
      className="mr-1 inline-block h-2 w-2 shrink-0 rounded-full"
      style={hollow ? { border: `1.5px solid ${color}`, background: "transparent" } : { background: color }}
    />
  );
}
