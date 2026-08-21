"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconInfo } from "@/components/shell/Icons";

/**
 * The explanation behind a control, not behind a hover.
 *
 * ── This reverses §8 rule 7, and the reversal has conditions ───────────────
 *
 * Rule 7 removed every info icon in the build, for two reasons that were both
 * correct at the time: the prototype shipped four icons that **rendered nothing
 * at all** when clicked, and hover does not exist on touch. A caveat nobody can
 * reach is a caveat nobody reads.
 *
 * The tiles were then carrying three lines of explanatory prose each, and four
 * of them across the top of a page is a wall a reader skims past — which is the
 * same failure the rule was written to prevent, arrived at from the other
 * direction. So the mechanism comes back, and the two original objections are
 * answered in the component rather than in a review comment:
 *
 * 1. **It is a button, not a hover target.** Click and tap open it; hover opens
 *    it too on pointer devices, but hover is the affordance and never the only
 *    one. It is focusable, it answers Enter and Space because it is a real
 *    `<button>`, and Escape closes it.
 * 2. **It cannot render nothing.** `children` is required and non-optional, and
 *    a layout test asserts every rendered info button has prose inside it. An
 *    icon that opens an empty panel fails the build rather than shipping.
 *
 * ── What may go in here, and what may not ─────────────────────────────────
 *
 * The same line as `Disclosure`: **the result is always visible, only the
 * working folds away.** What belongs in here is what a figure *is* — its
 * method, its provenance, the thing a reader asks once and never again. What
 * does not belong is a caveat, a refusal, a confidence interval or a selection
 * warning. Those stay in the open, because the one reader who most needs them
 * is the one in a hurry quoting the headline.
 *
 * The population, window, grain and denominator therefore stay on the face of
 * the tile. They are not explanation; they are part of the figure.
 */
export function InfoButton({
  label, children, align = "start",
}: {
  /** Names what is being explained, for screen readers: "About people you can name". */
  label: string;
  /** Required. There is no way to render this button with nothing behind it. */
  children: ReactNode;
  align?: "start" | "end";
}) {
  /**
   * The original defect, closed at the only place it can be closed.
   *
   * The prototype's four info icons opened nothing. A required `children` prop
   * does not prevent that on its own — `ReactNode` admits `null`, `false` and
   * `[]`, and a conditional that collapses to one of them typechecks fine. So
   * the button does not exist unless there is something behind it. **An icon
   * that opens an empty panel is worse than no icon**: it spends a reader's
   * click to tell them nothing and teaches them not to spend the next one.
   *
   * This cannot be a layout-test assertion, because the panel is client state
   * and the server output never contains it. It has to be here.
   *
   * Computed before the hooks and applied after them, so the hook order is
   * identical on every render whichever way it lands.
   */
  const empty =
    children == null ||
    children === false ||
    (Array.isArray(children) && children.filter(Boolean).length === 0) ||
    (typeof children === "string" && children.trim() === "");

  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Hover waits; click and focus do not.
   *
   * Four tiles across the top of a report carry four of these, a few pixels
   * from the labels a reader is already scanning. With no delay, moving the
   * pointer across that row pops three panels open and shut on the way past —
   * the interface reacting to a movement that was never aimed at it.
   *
   * A quarter of a second is long enough to mean the pointer stopped here and
   * short enough that a reader who did aim at it never notices waiting. The
   * delay is on hover only: a click or a keyboard focus is unambiguous and
   * opens immediately.
   */
  const cancelHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }, []);
  useEffect(() => cancelHover, [cancelHover]);

  // Escape closes, and a click anywhere outside closes. Both are here rather
  // than on the trigger because a popover that only closes by pressing the same
  // small target again is a popover people leave open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (empty) return null;

  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onMouseEnter={() => {
        cancelHover();
        hoverTimer.current = setTimeout(() => setOpen(true), 250);
      }}
      onMouseLeave={() => {
        cancelHover();
        setOpen(false);
      }}
    >
      <button
        type="button"
        /* A stable marker for the layout test, the same way the selection
           correction carries one. Matching on the aria-label would only find
           the triggers `Tile` generates, which all begin "About" — and the ones
           written by hand elsewhere are exactly the ones most likely to be
           built wrong. */
        data-info-button=""
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          cancelHover();
          setOpen((v) => !v);
        }}
        onFocus={() => {
          cancelHover();
          setOpen(true);
        }}
        onBlur={(e) => {
          if (!wrap.current?.contains(e.relatedTarget as Node)) {
            cancelHover();
            setOpen(false);
          }
        }}
        className="inline-grid h-4 w-4 place-items-center rounded-full text-ink-muted hover:bg-surface-hover hover:text-ink-secondary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <IconInfo className="h-3.5 w-3.5" />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          data-pop=""
          className={`absolute top-6 z-30 block w-[300px] rounded-lg border border-line-strong bg-surface-raised px-3.5 py-3 text-[12px] leading-relaxed font-normal text-ink-secondary normal-case shadow-pop ${
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left"
          }`}
          style={{ letterSpacing: "normal" }}
        >
          {children}
        </span>
      )}
    </span>
  );
}
