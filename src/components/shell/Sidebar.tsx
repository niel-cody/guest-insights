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
 * The Customers section, whole. Five items, and the order is deliberate.
 *
 * **The three built reports run first, group level down to the individual —
 * Overview, Behaviour, Guests — then the two production placeholders.**
 *
 * They used to be interleaved, with the two untouched loyalty reports sitting
 * between the Overview and the two pages that continue its argument. That
 * interrupts the goal path twice: a reviewer clicking down the list hits two
 * dead ends before reaching the surfaces the Overview is setting up. Placement
 * is in scope even where the pages themselves are not.
 *
 * Two of the five are **placeholders**. Loyalty Spend and Loyalty Redemption
 * exist in production and are not being built, changed or fixed. They are here so
 * the nav reads correctly, and they are marked so nobody mistakes a stand-in for
 * a surface this build owns.
 *
 * **There is no Customer Report.** It is the thing being replaced, so it does not
 * appear. There is no sixth item either: coverage is a panel inside Overview, and
 * a diagnostics report that operators had to be told to open is what it was
 * before.
 */
const CUSTOMERS = [
  { label: "Overview", href: "overview", placeholder: false },
  { label: "Behaviour", href: "behaviour", placeholder: false },
  { label: "Guests", href: "guests", placeholder: false },
  { label: "Loyalty Spend", href: "loyalty-spend", placeholder: true },
  { label: "Loyalty Redemption", href: "loyalty-redemption", placeholder: true },
] as const;

/**
 * The Team section. Three built reports, then the two that already ship.
 *
 * ── The group is called Team, and it used to be called Staff ───────────────
 *
 * "Staff" names a cost line. **"Team" names the people the cost line is made
 * of**, and the difference is the whole argument of this section: the lever is
 * raising what a committed hour returns, not cutting the hour. A manager who
 * opens a section called Staff is already looking for somebody to send home.
 * The production information architecture is being renamed to match, and this is
 * where that lands first.
 *
 * The order runs the same way Customers does — group level down to the
 * individual — but it starts one step earlier, because none of it works until
 * the two systems agree who a person is:
 *
 *   **People** is the identity spine. It is first because Performance and Margin
 *   both read through it, and a reviewer who meets the league table before they
 *   meet the 24 unproven matches underneath it will believe the league table.
 *
 *   **Performance** is who is doing well and *why* — the decomposition, not the
 *   ranking.
 *
 *   **Margin** is the money: what each service, day, week and month returns
 *   against what it costs.
 *
 * Staff Scorecard and Attendance ship in production and are **not built,
 * changed or fixed here**. They are present so the section reads whole and so
 * nobody proposes building the thing that already exists.
 */
const TEAM = [
  { label: "People", href: "team/people", placeholder: false },
  { label: "Performance", href: "team/performance", placeholder: false },
  { label: "Margin", href: "team/margin", placeholder: false },
  { label: "Staff Scorecard", href: "team/staff-scorecard", placeholder: true },
  { label: "Attendance", href: "team/attendance", placeholder: true },
] as const;

const GROUPS: {
  label: string;
  open?: boolean;
  items: readonly { label: string; href: string; placeholder: boolean }[];
}[] = [
  { label: "Sales", items: [] },
  { label: "Payments", items: [] },
  { label: "Operations", items: [] },
  { label: "Team", open: true, items: TEAM },
  { label: "Customers", open: true, items: CUSTOMERS },
  { label: "Admin", items: [] },
];

export function Sidebar({ orgSlug, period }: { orgSlug: string; period: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({ Team: true, Customers: true });

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
          {GROUPS.map((group) => {
            const isOpen = open[group.label] ?? group.open ?? false;
            const disabled = group.items.length === 0;
            return (
              <div key={group.label}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOpen((s) => ({ ...s, [group.label]: !isOpen }))}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] font-medium ${
                    disabled ? "text-ink-muted" : "text-ink hover:bg-surface-hover"
                  }`}
                >
                  <span>{group.label}</span>
                  {!disabled && (
                    <IconChevron
                      className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                  )}
                </button>
                {isOpen &&
                  group.items.map((item) => {
                    const href = `/${orgSlug}/${period}/${item.href}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        className={`ml-2.5 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] ${
                          active
                            ? "bg-accent-soft font-semibold text-accent"
                            : "text-ink-secondary hover:bg-surface-hover"
                        }`}
                      >
                        <span>{item.label}</span>
                        {/* Marked in the nav, not only on the page. A reviewer
                            deciding what to click should already know which two
                            of the five this build does not own. */}
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
          })}
        </div>
      </nav>
    </div>
  );
}
