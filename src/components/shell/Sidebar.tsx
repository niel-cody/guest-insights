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
 * Four surfaces, down from seven.
 *
 * Coming back, Growth and Value are absorbed into Overview and Members. The
 * pre-shift Brief moves to Loyalty: Insights reports what happened, Loyalty acts
 * on it, and the segment definitions are published once — here — rather than
 * redefined on both sides of the boundary.
 */
const GROUPS = [
  { label: "Sales", items: [] },
  { label: "Payments", items: [] },
  { label: "Operations", items: [] },
  { label: "Staff", items: [] },
  {
    label: "Customers",
    open: true,
    items: [
      { label: "Overview", href: "overview" },
      { label: "Members", href: "members" },
      { label: "Guest list", href: "guests" },
      { label: "Trade density", href: "trade" },
      { label: "Coverage", href: "coverage" },
    ],
  },
  { label: "Admin", items: [] },
];

export function Sidebar({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({ Customers: true });

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
                    const href = `/${orgSlug}/${item.href}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        className={`ml-2.5 block rounded-lg px-3 py-2 text-[13px] ${
                          active
                            ? "bg-accent-soft font-semibold text-accent"
                            : "text-ink-secondary hover:bg-surface-hover"
                        }`}
                      >
                        {item.label}
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
