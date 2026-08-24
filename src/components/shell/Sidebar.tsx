"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  IconBriefcase, IconChart, IconChevron, IconDollar, IconGear, IconHome,
  IconTag, IconTeam, IconUsers,
} from "./Icons";
import { SECTIONS, UTILITY, type Section } from "@/lib/nav";

/**
 * The Oolio Insights shell: a fixed icon rail beside a section navigator.
 *
 * The rail is *context*, not navigation — it exists so the POC sits inside the
 * product's real information architecture rather than floating on its own. It is
 * therefore rendered as inert context and marked as such, rather than as eight
 * buttons that do nothing. Build v1 shipped roughly twenty affordances with no
 * behaviour behind them; the rule now is that a control is wired or it is not a
 * control.
 */
const RAIL = [
  { label: "Home", icon: IconHome },
  { label: "Items", icon: IconTag },
  { label: "Pay", icon: IconDollar },
  { label: "Engage", icon: IconUsers },
  { label: "Team", icon: IconTeam },
  { label: "Insights", icon: IconChart, active: true },
  { label: "Admin", icon: IconBriefcase },
  { label: "Settings", icon: IconGear },
];

/**
 * One section: a header, and either its items or the question it is waiting to
 * answer.
 *
 * Declared at module scope rather than inside `Sidebar`. A component created
 * during render is a new component type on every render, so React remounts the
 * whole subtree and every piece of state inside it resets — which on a nav
 * means the open/closed group a reader just clicked snaps shut the moment
 * anything above re-renders.
 */
function Group({
  group, base, pathname, isOpen, onToggle,
}: {
  group: Section;
  base: string;
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const empty = group.items.length === 0;

  return (
    <div>
      <button
        type="button"
        disabled={empty}
        title={group.question}
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 pt-2 pb-0.5 text-left text-[13px] font-medium ${
          empty ? "cursor-default text-ink-muted" : "text-ink hover:bg-surface-hover"
        }`}
      >
        <span>{group.label}</span>
        {!empty && (
          <IconChevron
            className={`h-4 w-4 shrink-0 transition-transform duration-200 ease-in-out ${isOpen ? "" : "-rotate-90"}`}
          />
        )}
      </button>

      {/**
        * Every section says what it is for, and the alignment is load-bearing.
        *
        * ── Two things were wrong, and they compounded ──────────────────────
        *
        * The line was **indented further right than its own header** — ten
        * pixels for the header, twenty-two for the line under it — so each pair
        * staircased down and to the right instead of reading as one block. Nav
        * indentation means *containment*: items sit inside their section, which
        * is why they are indented. A section's own description is not inside
        * itself. It is now flush with the header it belongs to, and the only
        * indented things in the nav are the things a section contains.
        *
        * It also only rendered where nothing was built, which left Team, Guests
        * and Platform bare while the six around them carried a line. Nine
        * headers, six with a subheading, at uneven vertical intervals — the
        * ragged rhythm read as a rendering fault rather than a distinction, and
        * the distinction it was drawing was one no reader could have named. A
        * section that is exempt from saying what it is for is a section whose
        * name has to carry the whole job, and "Platform" does not.
        */}
      <p data-section-note="" className="mb-2.5 px-2.5 text-[11px] leading-snug text-ink-muted">
        {group.question}
      </p>

      {isOpen &&
        group.items.map((item) => {
          /**
           * ── Listed, not linked ────────────────────────────────────────
           *
           * A report that ships today and has no surface here renders as a
           * `<span>`, not a disabled `<a>`. There is no href, no hover, no
           * focus stop and nothing to click, because there is nothing behind
           * it — and a control that looks like a control and does nothing is
           * the defect this build has spent its whole life removing. It is a
           * label saying "this exists, and this is where it would go".
           */
          if (!item.href) {
            return (
              <span
                key={item.label}
                title="Ships in Oolio Insights today. Not part of this proof of concept — listed so you can judge where it lands."
                className="ml-2.5 block cursor-default rounded-lg px-3 py-2 text-[13px] text-ink-muted opacity-60"
              >
                {item.label}
              </span>
            );
          }

          const href = `${base}/${item.href}`;
          const active = pathname === href;
          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`ml-2.5 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] ${
                active
                  ? "bg-accent-soft font-semibold text-accent"
                  : "text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              <span>{item.label}</span>
              {/* Marked in the nav, not only on the page. A reviewer deciding
                  what to click should already know which of these this build
                  does not own. */}
              {item.placeholder && (
                <span className="rounded-full border border-line px-1.5 py-px text-[10px] font-medium tracking-wide text-ink-muted uppercase">
                  existing
                </span>
              )}
            </Link>
          );
        })}
    </div>
  );
}

export function Sidebar({ orgSlug, period }: { orgSlug: string; period: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({ Team: true, Guests: true });

  const base = `/${orgSlug}/${period}`;

  /** `fallback` is the group's own default, so the first click inverts what the
      reader is actually looking at rather than what the map happens to omit. */
  const toggle = (label: string, fallback: boolean) =>
    setOpen((s) => ({ ...s, [label]: !(s[label] ?? fallback) }));

  return (
    <div className="flex h-full">
      {/* icon rail */}
      <div
        className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3"
        aria-label="Oolio Insights sits inside this product. Only Insights is part of this proof of concept."
      >
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-[15px] font-bold text-white">
          N
        </div>
        {RAIL.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            aria-hidden={!active}
            title={active ? undefined : "Not part of this proof of concept"}
            className={`flex w-[60px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${
              active ? "bg-accent-soft text-accent" : "text-ink-muted opacity-55"
            }`}
          >
            <Icon className={active ? "text-accent" : "text-ink-muted"} />
            <span className="leading-none">{label}</span>
          </div>
        ))}
      </div>

      {/* section nav */}
      <nav className="flex w-[268px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <IconChart className="text-ink" />
          <span className="text-[15px] font-semibold">Insights</span>
        </div>

        {/* The search box that used to sit here searched nothing. Removed rather
            than left as an affordance the operator would try once and distrust. */}
        <div className="flex-1 overflow-y-auto px-2 pt-1 pb-4">
          {/* Home is a link, not a group. It has no children by definition — it
              is the state you land in, and a disclosure triangle on it would
              promise a list that will never exist. */}
          <Link
            href={base}
            aria-current={pathname === base ? "page" : undefined}
            title="What needs me right now?"
            className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium ${
              pathname === base
                ? "bg-accent-soft font-semibold text-accent"
                : "text-ink hover:bg-surface-hover"
            }`}
          >
            <IconHome className="h-4 w-4 shrink-0" />
            <span>Home</span>
          </Link>

          <div className="my-2 border-t border-line" />

          {SECTIONS.map((group) => (
            <Group
              key={group.label}
              group={group}
              base={base}
              pathname={pathname}
              isOpen={open[group.label] ?? group.open ?? false}
              onToggle={() => toggle(group.label, group.open ?? false)}
            />
          ))}

          {/* Platform sits after a rule because it is not one of the eight.
              Everything above answers a question about the business; this
              answers a question about the system underneath it. */}
          <div className="my-2 border-t border-line" />
          <Group
            group={UTILITY}
            base={base}
            pathname={pathname}
            isOpen={open[UTILITY.label] ?? false}
            onToggle={() => toggle(UTILITY.label, false)}
          />
        </div>
      </nav>
    </div>
  );
}
