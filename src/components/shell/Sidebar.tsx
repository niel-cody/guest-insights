"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  IconBriefcase, IconChart, IconChevron, IconDollar, IconGear, IconHome,
  IconSearch, IconTag, IconTeam, IconUsers,
} from "./Icons";

/**
 * The Oolio Insights shell: a fixed icon rail beside a section navigator.
 * Only Customers is populated — everything else is present so the POC sits in the
 * product's real information architecture rather than floating on its own.
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
      { label: "Coming back", href: "coming-back" },
      { label: "Value", href: "value" },
      { label: "Growth", href: "growth" },
      { label: "Guest list", href: "guests" },
      { label: "Brief", href: "brief" },
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
      <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
        <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-brand text-[15px] font-bold text-white">
          N
        </div>
        {RAIL.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            aria-current={active ? "page" : undefined}
            className={`group flex w-[60px] flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium ${
              active ? "bg-accent-soft text-accent" : "text-ink-secondary"
            }`}
          >
            <Icon className={active ? "text-accent" : "text-ink-secondary"} />
            <span className="leading-none">{label}</span>
          </div>
        ))}
      </nav>

      {/* section nav */}
      <nav className="flex w-[268px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <IconChart className="text-ink" />
          <span className="text-[15px] font-semibold">Insights</span>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken px-2.5 py-2">
            <IconSearch className="h-4 w-4 text-ink-muted" />
            <input
              placeholder="Search…"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-ink-muted"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
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
