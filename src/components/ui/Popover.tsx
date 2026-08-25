"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A menu that floats over the page, and closes when you leave it.
 *
 * ── The mistake this exists to correct ─────────────────────────────────────
 *
 * Three of these shipped as bare `<details>`, carrying a comment claiming the
 * browser "already handles open state, Escape and the closing click". **Two
 * thirds of that was wrong.** `<details>` handles open state and nothing else:
 * there is no light dismiss and no Escape handling in the element, so a menu
 * opened here stayed open until you clicked its own summary again — through
 * navigation, through clicking the report behind it, through anything.
 *
 * It is exactly the failure mode the element invites, because the 90% case for
 * `<details>` is an *inline disclosure* that expands in the flow, where staying
 * open is correct and dismissing on an outside click would be maddening. The
 * other disclosures in this build are that, and they are deliberately not built
 * on this.
 *
 * ── Why not the Popover API ────────────────────────────────────────────────
 *
 * `popover` gives light dismiss and Escape natively with no JavaScript, which
 * is the right answer and is where this should end up. It puts the panel in the
 * top layer, though, so positioning it against its trigger needs CSS anchor
 * positioning — Chrome-only today. Shipping that means the menu lands in the
 * wrong place on Safari and Firefox, which is a worse bug than the one being
 * fixed. Two listeners and a ref, until anchor positioning lands.
 *
 * ── `pointerdown`, not `click` ─────────────────────────────────────────────
 *
 * On `click` the menu is still open through the whole press, so a click landing
 * on a control behind it both dismisses the menu and operates that control. On
 * `pointerdown` it is gone before the press completes. Captured, so a handler
 * inside the page that stops propagation cannot leave the menu stranded open.
 */
export function Popover({
  summary, children, className = "", panelClassName = "", closeOnSelect = false, label,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  /**
   * Whether picking something inside closes it.
   *
   * True for a menu where one choice ends the interaction — a status, an
   * organisation. **False for a multi-select**, where the whole point is to tick
   * several and closing after the first would make it unusable. That is why
   * this is a prop rather than a default: `Locations` needs the opposite of
   * what the other two need.
   */
  closeOnSelect?: boolean;
  label?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function dismiss() {
      if (el && el.open) el.open = false;
    }

    function onPointerDown(e: PointerEvent) {
      if (!el?.open) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      dismiss();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || !el?.open) return;
      dismiss();
      // Focus goes back to the control that opened it, or it lands on <body>
      // and the next Tab starts from the top of the document.
      el.querySelector("summary")?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className={className}>
      <summary
        aria-label={label}
        title={label}
        className="flex cursor-pointer list-none items-center marker:hidden"
      >
        {summary}
      </summary>
      <div
        className={panelClassName}
        /* Bubbles, so whatever was clicked has already run its own handler by
           the time this fires. No deferral needed. */
        onClick={closeOnSelect ? () => { if (ref.current) ref.current.open = false; } : undefined}
      >
        {children}
      </div>
    </details>
  );
}
