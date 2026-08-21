"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { IconInfo } from "@/components/shell/Icons";
import { Drawer } from "@/components/ui/Drawer";

/**
 * The explain drawer. **Task 0 of the Build 5 review, and the reason five other
 * tasks collapse into one component.**
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * Five separate sticky notes on the Build 5 board asked for the same thing in
 * five different words: Overview C and H, Behaviour B, E and F. *Move the
 * explanatory text off the face and into a side drawer, behind a button.* It
 * was the single most repeated idea on the board, and the closing caution on
 * Behaviour B is the one that matters — "we have to think about how we would
 * build that". Built five times as one-offs, this is five drawers that drift.
 * Built once, it is a pattern a reader learns in the first panel and carries to
 * the rest.
 *
 * ── The stay-or-move rule, which is the whole of the design ────────────────
 *
 * **Anything that changes how the number should be read stays visible.
 * Anything that explains how the number was built moves in here.**
 *
 * That is the same line `Disclosure` and `InfoButton` already draw, stated once
 * more because this component is the one most likely to be misused: a drawer is
 * roomy, and a roomy container invites a tired author to sweep a caveat into it
 * to tidy the page. So, explicitly, and these are not negotiable per panel:
 *
 * - A **refusal** never moves in here. A panel that declines to publish says so
 *   where the figure would have been.
 * - A **confidence interval** never moves in here when the point estimate is on
 *   the face. A range is part of the figure.
 * - A **selection warning** never moves in here. "Association, not effect" is
 *   the sentence that stops a number being misused, and the reader who most
 *   needs it is the one screenshotting the headline.
 * - A **window or population constraint** never moves in here. Which people,
 *   over what days, is what stops a figure being ambiguous.
 *
 * What does move: grain, method, provenance, denominators already stated once,
 * reconciliations, render rules, and the working behind an index.
 *
 * ── Two sections, in the same order every time ─────────────────────────────
 *
 * `showing` — how to read it. `made` — grain, population, method, known limits.
 * Both are optional individually and at least one is required in practice; a
 * drawer with neither does not render, for the same reason `InfoButton` refuses
 * to: **an affordance that opens nothing spends a reader's click to tell them
 * nothing, and teaches them not to spend the next one.** The prototype shipped
 * four info icons that opened empty panels and it cost the build a review.
 */
export function ExplainDrawer({
  label,
  title,
  showing,
  made,
  /**
   * Overrides the trigger's visible text. The default is deliberately the same
   * three words everywhere — a pattern is only a pattern if the reader can
   * recognise it without reading it.
   */
  triggerLabel = "About this",
}: {
  /** Names the panel for screen readers: "Explain segments". */
  label: string;
  /** Heading inside the drawer. Usually the panel's own title. */
  title: string;
  /** How to read what is on screen. */
  showing?: ReactNode;
  /** Grain, population, method, known limits. */
  made?: ReactNode;
  triggerLabel?: string;
}) {
  /**
   * Same guard as `InfoButton`, same reason.
   *
   * `ReactNode` admits `null`, `false` and `[]`, so a conditional that collapses
   * to one of them typechecks perfectly and ships a button that opens an empty
   * drawer. Computed before the hooks and applied after them so hook order is
   * identical on every render whichever way it lands.
   */
  const isEmpty = (n: ReactNode) =>
    n == null ||
    n === false ||
    (Array.isArray(n) && n.filter(Boolean).length === 0) ||
    (typeof n === "string" && n.trim() === "");
  const empty = isEmpty(showing) && isEmpty(made);

  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  // Focus returns to the trigger on every close, not just the Escape one. A
  // drawer that swallows focus is a drawer a keyboard user cannot leave, and
  // this one covers a third of the screen. Escape, the scrim and the close
  // button all land here, so all three behave the same — they did not before.
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);

  if (empty) return null;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        /* A stable marker, so a layout test can assert every rendered trigger
           has prose behind it and that the pattern is used rather than
           re-invented per panel. */
        data-explain-drawer=""
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-secondary hover:border-line-strong hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <IconInfo className="h-3.5 w-3.5" />
        {triggerLabel}
      </button>

      <Drawer
        open={open}
        onClose={close}
        label={label}
        eyebrow="About this panel"
        title={title}
      >
        {!isEmpty(showing) && <Section heading="What this is showing">{showing}</Section>}
        {!isEmpty(made) && (
          <Section heading="How it is made" first={isEmpty(showing)}>
            {made}
          </Section>
        )}

        {/* The rule, stated to the reader rather than only to the author. A
            reader who knows nothing important is hidden in here reads the page
            faster, and a reader who suspects otherwise reads every drawer. */}
        <p className="mt-6 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
          Nothing that changes how a figure should be read is in here. Caveats, refusals,
          confidence intervals and the population a figure covers stay on the page.
        </p>
      </Drawer>
    </>
  );
}

function Section({
  heading, children, first = true,
}: {
  heading: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? "" : "mt-6 border-t border-line pt-5"}>
      <h3 className="text-[12px] font-semibold tracking-wide text-ink-secondary uppercase">
        {heading}
      </h3>
      <div className="mt-2 flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-secondary [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
