"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconX } from "@/components/shell/Icons";

/**
 * The one drawer.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * There were three of these — the explain drawer, the check register and the
 * guest detail — each with its own copy of the scrim, the panel, the escape
 * handler and the scroll lock. Three copies is three places for the same bug,
 * and it had already produced three slightly different close behaviours. The
 * filter bar has exactly one implementation for exactly this reason (§12); the
 * drawer is the other piece of chrome that follows the reader across every
 * report, and it now has one too.
 *
 * ── Why it animates, when most things here do not ──────────────────────────
 *
 * A drawer is an *occasional* surface. A reader opens one when they want to
 * know how a figure was made, a handful of times a session — not the dozens of
 * times a day that make animation a tax. That is the band where motion earns
 * its place: a panel that appears instantly at full size, covering half the
 * report, reads as a page change rather than as a layer over the page the
 * reader is still in.
 *
 * It enters and leaves **along the same path**. In from the right, out to the
 * right. A panel that slides in from an edge and then fades out in place tells
 * the reader it went somewhere other than where it came from, and takes the
 * swipe-to-dismiss instinct with it.
 *
 * ── Why the panel is not always mounted ────────────────────────────────────
 *
 * The obvious way to animate an exit is to keep the panel in the DOM and toggle
 * a class. That would put every drawer's prose into the prerendered HTML of
 * every page, and the layout tests assert on that HTML — several of them by
 * slicing it between two markers to prove two blocks are adjacent. A closed
 * drawer's contents landing in the middle of one of those slices would break
 * assertions that have nothing to do with drawers.
 *
 * So the panel mounts on open and stays mounted through the exit, then leaves.
 * Server output is byte-identical to what it was.
 */

/**
 * Mount-through-exit, shared by every overlay in the product.
 *
 * An element removed from the DOM cannot animate on its way out, so the two
 * facts an overlay needs are kept apart: `mounted` says whether it is in the
 * tree, and `state` says which end of the transition it is playing. `mounted`
 * stays true until the exit has finished.
 *
 * Exported because the guest drawer cannot use `Drawer` — it carries a person's
 * name, a tier pill and a prev/next pair in its header rather than the eyebrow
 * and title every other drawer has — but it must move exactly like the others.
 * A reader who has learned how one drawer arrives should not have to learn a
 * second time on the page where the drawers are most used.
 */
export function useOverlayState(open: boolean) {
  /** In the DOM. Stays true through the exit transition. */
  const [mounted, setMounted] = useState(false);
  /** Driving `data-state`. Flipped a frame after mount so the enter runs. */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // A frame, so the browser paints the closed state before the open one.
      // Setting both in the same tick is how an "animated" panel ends up
      // appearing instantly, which is the bug this file exists to fix.
      const frame = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    // Comfortably past --dur-exit. Unmounting a little late costs nothing;
    // unmounting early cuts the exit off mid-travel.
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  return { mounted, state: (shown ? "open" : "closed") as "open" | "closed" };
}

export function Drawer({
  open, onClose, label, eyebrow, title, width = 440, children,
}: {
  open: boolean;
  /** Called on Escape, scrim click and the close button. Restores trigger focus. */
  onClose: () => void;
  /** Names the dialog for a screen reader. */
  label: string;
  /** The small line above the title: what kind of thing this is. */
  eyebrow: string;
  title: string;
  /** Panel width in px. The register carries more columns than the explainer. */
  width?: number;
  children: ReactNode;
}) {
  const { mounted, state } = useOverlayState(open);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mounted) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus stays inside an aria-modal dialog. Without this the reader tabs
      // straight out of the panel and into the report behind it, which is still
      // there, still scrollable by keyboard, and now unreachable by eye.
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the drawer is over it.
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prior;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* The scrim closes on click. A drawer that only closes by finding a small
          × in a corner is a drawer people leave open. */}
      <div
        data-overlay-scrim=""
        data-state={state}
        className="absolute inset-0 bg-black/35"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panel}
        data-overlay-panel=""
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="relative flex h-full w-full flex-col border-l border-line bg-surface outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
              {eyebrow}
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold text-ink">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
