"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  IconBriefcase, IconChart, IconChevron, IconDollar, IconGear, IconHome,
  IconTag, IconTeam, IconUsers,
} from "./Icons";

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
 * ═══ Insights is eight subjects, plus a landing state and a utility drawer ═══
 *
 * The nav this replaces had six groups — Sales, Payments, Operations, Team,
 * Customers, Admin — three of which were empty and none of which was derived
 * from anything. It was the shape the POC happened to grow into.
 *
 * The eight below are **subjects, and each is a question an operator actually
 * asks**. That is the whole test, and it is why the list is not the org chart
 * and not the source systems:
 *
 *   1. Sales           What did we sell?
 *   2. Menu & Product   What's selling, and what's it earning?
 *   3. Inventory        What do I hold, what did it cost, where is it leaking?
 *   4. Service          How well did we deliver it?
 *   5. Team             Who did it, and what did it cost to do?
 *   6. Guests           Who did we serve, are they coming back?
 *   7. Finance          Did the money arrive, does it reconcile?
 *   8. Exceptions       Should this have happened?
 *
 * A surface belongs to the section whose question it answers. When a surface
 * seems to fit two, it is usually answering neither well, and that is a finding
 * about the surface rather than a reason to duplicate it into both.
 *
 * ── Home and Platform are deliberately not numbered ────────────────────────
 *
 * **Home is a landing state, not a subject.** It answers "what needs me right
 * now?", which is not a question about the business — it is a question about
 * the reader. It carries whatever is live, whatever is shouting, and whatever
 * they saved. Filing it as section zero would make it compete with the eight,
 * and within a fortnight somebody would be arguing about which of its cards is
 * "really" a Sales card.
 *
 * **Platform is a drawer, not a subject.** Delivery, planning inputs and
 * governance are things you *operate*, not things you *read* — the same
 * distinction that pulled People Mapping out of Team. It sits last, apart, and
 * closed.
 *
 * ── Six of the eight are empty here, and are shown anyway ──────────────────
 *
 * Sales, Menu & Product, Inventory, Service, Finance and Exceptions have
 * nothing in this proof of concept. They render as inert headers carrying their
 * question, because **a reviewer cannot tell us whether the shape is right if
 * they can only see the two corners we happened to build.** The same argument
 * put Loyalty Spend in the nav.
 *
 * They are inert rather than clickable for the reason the rail is inert: a
 * control is wired or it is not a control.
 */
type Item = { label: string; href: string; placeholder: boolean };

/**
 * §6. Guests. The section formerly called Customers.
 *
 * ── Why the rename is not cosmetic ─────────────────────────────────────────
 *
 * "Customers" names a transaction counterparty. **"Guests" names somebody you
 * are hosting**, and the difference is the argument of the section: the lever
 * is what a returning person is worth, not what a transaction was worth. It is
 * the same move that renamed Staff to Team, for the same reason, and hospitality
 * operators already use the word at the table.
 *
 * ── The item inside it had to be renamed, and this is why ──────────────────
 *
 * There was a report called Guests inside a section now also called Guests, and
 * "Guests › Guests" reads as a mistake even when it is not. It is now
 * **Individuals**, which is the more honest name regardless of the collision:
 * every other surface in this section computes over a population, and this is
 * the only one that goes down to the person. The route stays `/guests` —
 * links to it are in circulation, and a shared link that 404s is the defect
 * Phase 0 spent its time removing.
 *
 * ── Order: the four built reports run group level down to the person ───────
 *
 * Overview, Behaviour, Retention and Churn, Individuals — then the two
 * production stand-ins. They used to be interleaved, which interrupted the goal
 * path twice: a reviewer clicking down the list hit two dead ends before
 * reaching the surfaces the Overview sets up.
 *
 * Retention sits between Behaviour and Individuals on purpose. Behaviour ends on
 * *how* people trade; Individuals opens the person. Whether they came back at
 * all is the question between the two.
 *
 * Two are **stand-ins**. Loyalty Spend and Loyalty Redemption exist in
 * production and are not being built, changed or fixed. They are here so the
 * section reads correctly, and they are marked so nobody mistakes a stand-in for
 * a surface this build owns. **There is no Customer Report** — it is the thing
 * being replaced, so it does not appear.
 */
const GUESTS: readonly Item[] = [
  { label: "Overview", href: "overview", placeholder: false },
  { label: "Behaviour", href: "behaviour", placeholder: false },
  { label: "Retention and Churn", href: "retention", placeholder: false },
  { label: "Individuals", href: "guests", placeholder: false },
  { label: "Loyalty Spend", href: "loyalty-spend", placeholder: true },
  { label: "Loyalty Redemption", href: "loyalty-redemption", placeholder: true },
] as const;

/**
 * §5. Team. Two built reports, then the two that already ship.
 *
 * The group is called Team, and it used to be called Staff. "Staff" names a cost
 * line; **"Team" names the people the cost line is made of**, and the difference
 * is the whole argument of this section — the lever is raising what a committed
 * hour returns, not cutting the hour. A manager who opens a section called Staff
 * is already looking for somebody to send home.
 *
 *   **Performance** is who is doing well and *why* — the decomposition, not the
 *   ranking.
 *
 *   **Margin** is the money: what each service, day, week and month returns
 *   against what it costs.
 *
 * People Mapping led this section once, on the argument that a reviewer who
 * meets the league table before they meet the unproven matches underneath it
 * will believe the league table. The risk was real; the placement was the wrong
 * answer to it. **It is a review queue, not a report**, and a queue at the top
 * of a reporting section is a chore standing in front of everybody who came to
 * read something. It is in Platform now, and the caveat it used to carry by
 * adjacency travels instead: `SpineChip` rides in the header of both reports
 * below, says how many joins beneath those figures are unproven, and links to
 * the queue. Chrome that follows the reader is strictly stronger than
 * adjacency — adjacency only works on the reader who arrives through the nav,
 * and most arrive through a link.
 *
 * Staff Scorecard and Attendance ship in production and are **not built,
 * changed or fixed here**.
 */
const TEAM: readonly Item[] = [
  { label: "Performance", href: "team/performance", placeholder: false },
  { label: "Margin", href: "team/margin", placeholder: false },
  { label: "Staff Scorecard", href: "team/staff-scorecard", placeholder: true },
  { label: "Attendance", href: "team/attendance", placeholder: true },
] as const;

/**
 * Platform. Where the things you *act on* live, as opposed to the things you
 * read. Formerly Admin, and renamed because the target IA reserves Admin for the
 * product-wide rail entry — an Insights section called Admin sitting beside a
 * rail icon called Admin is two different scopes wearing one word.
 *
 * Both items are work queues rather than reports. People Mapping is the identity
 * join a manager works through; Data Health is what the till is not capturing
 * and what each gap costs an answer.
 *
 * Data Health is here rather than inside a report for the same reason People
 * Mapping is. A caveat on a figure has to travel with the figure — the coverage
 * chip, the check register, the spine chip and the labour note all do. "This
 * venue stopped recording party size in February 2025" is not a caveat on a
 * reading; it is a job for somebody who is not reading a chart at all.
 *
 * Its two engines had been built, maintained and covered by checks while
 * rendering nowhere: their only consumer was `TrustPanel`, which left Overview
 * and was never rehoused.
 */
const PLATFORM: readonly Item[] = [
  { label: "People Mapping", href: "admin/people-mapping", placeholder: false },
  { label: "Data Health", href: "admin/data-health", placeholder: false },
] as const;

/**
 * The eight subjects in order, each carrying the question it answers.
 *
 * The question is not decoration. It is on the header as a tooltip on every
 * group and rendered in full under the six empty ones, because **an empty
 * section that does not say what it is for is indistinguishable from a section
 * nobody has thought about** — and a reviewer being asked whether the shape is
 * right needs to be able to tell those two apart.
 */
const SECTIONS: {
  label: string;
  question: string;
  open?: boolean;
  items: readonly Item[];
}[] = [
  { label: "Sales", question: "What did we sell?", items: [] },
  { label: "Menu & Product", question: "What's selling, and what's it earning?", items: [] },
  { label: "Inventory", question: "What do I hold, what did it cost, where is it leaking?", items: [] },
  { label: "Service", question: "How well did we deliver it?", items: [] },
  { label: "Team", question: "Who did it, and what did it cost to do?", open: true, items: TEAM },
  { label: "Guests", question: "Who did we serve, are they coming back?", open: true, items: GUESTS },
  { label: "Finance", question: "Did the money arrive, does it reconcile?", items: [] },
  { label: "Exceptions", question: "Should this have happened?", items: [] },
];

/** Not a subject: a drawer, sitting after the eight and closed. */
const UTILITY = {
  label: "Platform",
  question: "Delivery, planning inputs, governance.",
  items: PLATFORM,
};

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
  group: { label: string; question: string; items: readonly Item[] };
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
        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium ${
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

      {/* An empty section says what it is for. Otherwise it is
          indistinguishable from one nobody has thought about. */}
      {empty && (
        <p className="mb-1 ml-2.5 px-3 text-[11px] leading-snug text-ink-muted opacity-70">
          {group.question}
        </p>
      )}

      {!empty &&
        isOpen &&
        group.items.map((item) => {
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
