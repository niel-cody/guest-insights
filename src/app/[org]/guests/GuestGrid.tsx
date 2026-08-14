"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconX } from "@/components/shell/Icons";
import { Card, EmptyState, Facts, Pill } from "@/components/ui/Primitives";
import { SEGMENT_LABEL, count, dayLabel, habit, money, pct } from "@/lib/metrics";
import type { Guest, Guests, Org } from "@/lib/types";

type SortKey = "spend" | "visits" | "daysSince" | "firstSeen";

/**
 * The guest grid and drawer.
 *
 * The grid works on a bounded sample; the tiles above it always report the true
 * population. That distinction is stated on screen rather than implied, because a
 * silently truncated population is exactly the defect this build exists to remove
 * — the live report ships one today and nobody looking at it can tell.
 */
export function GuestGrid({ guests, org }: { guests: Guests; org: Org }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | "member" | "card">("all");
  const [segment, setSegment] = useState<string>("all");
  const [venue, setVenue] = useState("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [open, setOpen] = useState<Guest | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = guests.rows.filter(
      (g) =>
        (tier === "all" || g.tier === tier) &&
        (segment === "all" || g.segment === segment) &&
        (venue === "all" || g.homeStoreId === venue) &&
        (!needle || g.name.toLowerCase().includes(needle) || g.id.includes(needle)),
    );
    const dir = sort === "firstSeen" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort === "firstSeen") return (a.firstSeen ?? "").localeCompare(b.firstSeen ?? "");
      return (Number(b[sort]) - Number(a[sort])) * (dir === -1 ? 1 : -1);
    });
  }, [guests.rows, q, tier, segment, venue, sort]);

  const shown = filtered.slice(0, 300);
  const index = open ? filtered.findIndex((g) => g.id === open.id) : -1;

  return (
    <>
      <Card
        title={`${org.labels.guests[0].toUpperCase()}${org.labels.guests.slice(1)}`}
        subtitle={`${count(filtered.length)} of ${count(guests.sampled)} in the working set · population ${count(guests.population)}`}
        padded={false}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <IconSearch className="h-4 w-4 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="w-28 bg-transparent text-[13px] outline-none placeholder:text-ink-muted"
              />
            </label>
            <Choice value={tier} onChange={(v) => setTier(v as never)} options={[
              { value: "all", label: "All tiers" },
              { value: "member", label: "Members" },
              { value: "card", label: "Card" },
            ]} />
            <Choice value={segment} onChange={setSegment} options={[
              { value: "all", label: "All segments" },
              ...Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label })),
            ]} />
            <Choice value={venue} onChange={setVenue} options={[
              { value: "all", label: "All venues" },
              ...org.venues.map((v) => ({ value: v.id, label: v.name })),
            ]} />
            <Choice value={sort} onChange={(v) => setSort(v as SortKey)} options={[
              { value: "spend", label: "By spend" },
              { value: "visits", label: `By ${org.labels.visits}` },
              { value: "daysSince", label: "By time away" },
              { value: "firstSeen", label: "By first seen" },
            ]} />
          </div>
        }
      >
        {shown.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody matches" body="Loosen a filter, or clear the search." />
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                  <th className="px-5 py-2 font-medium">{org.labels.guest}</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Segment</th>
                  <th className="px-3 py-2 text-right font-medium">{org.labels.visits}</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Last seen</th>
                  <th className="px-5 py-2 font-medium">Home venue</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => (
                  <tr
                    key={g.id}
                    onClick={() => setOpen(g)}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-5 py-2 font-medium text-ink">{g.name}</td>
                    <td className="px-3 py-2">
                      <Pill tone={g.tier === "member" ? "member" : "card"}>
                        {g.tier === "member" ? "Member" : "Card"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{SEGMENT_LABEL[g.segment]}</td>
                    {/* Grids never round. */}
                    <td className="tnum px-3 py-2 text-right">{g.visits}</td>
                    <td className="tnum px-3 py-2 text-right">{money(g.spend)}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-secondary">{g.daysSince}d ago</td>
                    <td className="px-5 py-2 text-ink-secondary">{g.homeStore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-muted">
          {filtered.length > shown.length && <>Showing the first {count(shown.length)} of {count(filtered.length)} matches. </>}
          The grid works on a {count(guests.sampled)}-row sample of the{" "}
          {count(guests.population)} known {org.labels.guests} — the top of the value
          distribution in full, plus a deterministic sample of the rest. Every figure
          above the grid is computed on the whole population, not on this sample.
        </p>
      </Card>

      {open && (
        <Drawer
          guest={open}
          org={org}
          onClose={() => setOpen(null)}
          onPrev={index > 0 ? () => setOpen(filtered[index - 1]) : undefined}
          onNext={index >= 0 && index < filtered.length - 1 ? () => setOpen(filtered[index + 1]) : undefined}
        />
      )}
    </>
  );
}

function Choice({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-medium outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Drawer({
  guest: g, org, onClose, onPrev, onNext,
}: {
  guest: Guest;
  org: Org;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const oneVisit = g.visits === 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/25" />
      <aside className="flex w-[420px] max-w-full flex-col overflow-y-auto border-l border-line bg-surface-raised">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold text-ink">{g.name}</h2>
              <Pill tone={g.tier === "member" ? "member" : "card"}>
                {g.tier === "member" ? "Member" : "Card"}
              </Pill>
            </div>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {SEGMENT_LABEL[g.segment]} · {g.homeStore}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-hover">
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          {oneVisit ? (
            <EmptyState
              title="Seen once"
              body={
                <>
                  <p>
                    Came in on {g.firstSeen ? dayLabel(g.firstSeen) : "—"}, spent{" "}
                    {money(g.spend)}, and has not been back in {g.daysSince} days.
                  </p>
                  <p className="mt-2">
                    There is no habit here to be early or late against, so no lifecycle
                    verdict is shown. This is the largest single group in the business and
                    the only useful question about it is whether a second visit can be
                    caused.
                  </p>
                </>
              }
            />
          ) : (
            <Facts
              rows={[
                [`${org.labels.visits[0].toUpperCase()}${org.labels.visits.slice(1)}`, String(g.visits)],
                ["Orders", String(g.orders)],
                ["Total spend", money(g.spend)],
                ["Average per visit", money(g.spend / g.visits)],
                ["Usual gap", g.cadenceDays ? `${Math.round(g.cadenceDays)} days` : "—"],
                ["Last seen", `${g.daysSince} days ago`],
                ["First seen", g.firstSeen ? dayLabel(g.firstSeen) : "—"],
                ["Known for", `${g.tenureDays} days`],
                ["Venues visited", String(g.venues)],
                ["Value band", `${["Lowest", "Second", "Middle", "Fourth", "Top"][g.valueBand - 1]} fifth`],
              ]}
            />
          )}

          {g.tier === "card" && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <p className="text-[13px] font-medium text-ink">Recognised, not identified</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                This person is recognised by the card they pay with. There is no name,
                email or phone — and no lifecycle verdict, because a reissued card looks
                exactly like a customer who stopped coming. What you can do is recognise
                them at the counter: they are on the printed sheet.
              </p>
            </div>
          )}

          {g.venues > 1 && (
            <div className="rounded-lg border border-line p-3">
              <p className="text-[13px] leading-relaxed text-ink">
                Visits <strong>{g.venues}</strong> of your venues. Cross-venue guests are{" "}
                {pct(0.301, 0)} of card trade across the estate, and they are invisible to a
                per-venue report.
              </p>
            </div>
          )}
        </div>

        <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button
            type="button" onClick={onPrev} disabled={!onPrev}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium disabled:opacity-40 hover:bg-surface-hover"
          >
            ← Previous
          </button>
          <button
            type="button" onClick={onNext} disabled={!onNext}
            className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium disabled:opacity-40 hover:bg-surface-hover"
          >
            Next →
          </button>
        </footer>
      </aside>
    </div>
  );
}
