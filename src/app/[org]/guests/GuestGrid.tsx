"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconSearch, IconX } from "@/components/shell/Icons";
import { Card, EmptyState, Facts, Pill } from "@/components/ui/Primitives";
import { SEGMENT_LABEL, count, dayLabel, habit, money, overdueRatio, pct } from "@/lib/metrics";
import type { Guest, Guests, Org } from "@/lib/types";

type SortKey = "spend" | "visits" | "daysSince" | "firstSeen";

const PAGE = 100;
const BAND_LABEL = ["Lowest", "Second", "Middle", "Fourth", "Top"];

/**
 * Names are masked by default.
 *
 * The previous build rendered unmasked full names beside spend, last-seen and
 * home venue, with no role gate, no export control and no audit. The names in
 * this snapshot are synthetic, which is a reason the demo is safe to show and
 * not a reason the pattern is safe to ship — so the surface behaves the way the
 * real one has to.
 */
function mask(name: string): string {
  const parts = name.split(" ");
  return parts
    .map((p, i) => (i === 0 ? p : /^[A-Z0-9]{4}$/.test(p) ? p : `${p[0]}.`))
    .join(" ");
}

/**
 * The guest grid and drawer.
 *
 * The grid works on a bounded sample and paginates it; the tiles above always
 * report the true population. That distinction is stated rather than implied.
 */
export function GuestGrid({ guests, org, crossVenueShare }: {
  guests: Guests;
  org: Org;
  crossVenueShare: number;
}) {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<string>(sp.get("tier") ?? "all");
  const [segment, setSegment] = useState<string>(sp.get("segment") ?? "all");
  const [band, setBand] = useState<string>("all");
  const [daypart, setDaypart] = useState<string>(sp.get("daypart") ?? "all");
  const [venue, setVenue] = useState("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [minVisits] = useState(Number(sp.get("minVisits") ?? 0));
  const [unmasked, setUnmasked] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Guest | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = guests.rows.filter(
      (g) =>
        (tier === "all" || g.tier === tier) &&
        (segment === "all" || g.segment === segment) &&
        (band === "all" || String(g.valueBand) === band) &&
        (daypart === "all" || g.homeDaypart === daypart) &&
        (venue === "all" || g.homeStoreId === venue) &&
        g.visits >= minVisits &&
        (!needle || g.name.toLowerCase().includes(needle) || g.id.includes(needle)),
    );
    return rows.sort((a, b) => {
      if (sort === "firstSeen") return (a.firstSeen ?? "").localeCompare(b.firstSeen ?? "");
      return Number(b[sort]) - Number(a[sort]);
    });
  }, [guests.rows, q, tier, segment, band, daypart, venue, sort, minVisits]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const index = open ? filtered.findIndex((g) => g.id === open.id) : -1;
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };

  const dayparts = org.dayparts.filter((d) => guests.rows.some((g) => g.homeDaypart === d.key));

  return (
    <>
      <Card
        title={`${org.labels.guests[0].toUpperCase()}${org.labels.guests.slice(1)}`}
        subtitle={`${count(filtered.length)} match · ${count(guests.sampled)} in the working set · ${count(guests.population)} known in total`}
        padded={false}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <IconSearch className="h-4 w-4 text-ink-muted" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(0); }}
                placeholder="Name or id"
                className="w-28 bg-transparent text-[13px] outline-none placeholder:text-ink-muted"
              />
            </label>
            <Choice label="Tier" value={tier} onChange={reset(setTier)} options={[
              { value: "all", label: "All" },
              { value: "member", label: "Members" },
              { value: "card", label: "Card only" },
            ]} />
            <Choice
              label="Segment"
              value={segment}
              onChange={reset(setSegment)}
              disabled={tier === "card"}
              hint={tier === "card" ? "Only members carry a lifecycle verdict" : undefined}
              options={[
                { value: "all", label: "All" },
                ...Object.entries(SEGMENT_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
            <Choice label="Value" value={band} onChange={reset(setBand)} options={[
              { value: "all", label: "All" },
              ...BAND_LABEL.map((l, i) => ({ value: String(i + 1), label: `${l} fifth` })),
            ]} />
            {dayparts.length > 1 && (
              <Choice label="Daypart" value={daypart} onChange={reset(setDaypart)} options={[
                { value: "all", label: "All" },
                ...dayparts.map((d) => ({ value: d.key, label: d.label })),
              ]} />
            )}
            {org.venues.length > 1 && (
              <Choice label="Venue" value={venue} onChange={reset(setVenue)} options={[
                { value: "all", label: "All" },
                ...org.venues.map((v) => ({ value: v.id, label: v.name })),
              ]} />
            )}
            <Choice label="Sort" value={sort} onChange={reset((v: string) => setSort(v as SortKey))} options={[
              { value: "spend", label: "Spend" },
              { value: "visits", label: org.labels.visits },
              { value: "daysSince", label: "Time away" },
              { value: "firstSeen", label: "First seen" },
            ]} />
            <button
              type="button"
              onClick={() => setUnmasked((v) => !v)}
              aria-pressed={unmasked}
              title="In production this view is role-gated and every reveal is audit-logged"
              className={`rounded-lg border px-2.5 py-1.5 text-[13px] font-medium ${
                unmasked ? "border-warning bg-surface-sunken text-ink" : "border-line text-ink-secondary hover:bg-surface-hover"
              }`}
              style={unmasked ? { borderColor: "var(--warning)" } : undefined}
            >
              {unmasked ? "Names shown" : "Names masked"}
            </button>
          </div>
        }
      >
        {shown.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nobody matches" body="Loosen a filter, or clear the search." />
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="border-b border-line text-left text-[12px] text-ink-secondary">
                  <th className="px-5 py-2 font-medium">{org.labels.guest}</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Segment</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 text-right font-medium">{org.labels.visits}</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 text-right font-medium">Last seen</th>
                  <th className="px-3 py-2 font-medium">Usual time</th>
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
                    <td className="px-5 py-2">
                      <span className="font-medium text-ink">{unmasked ? g.name : mask(g.name)}</span>
                      <code className="ml-2 text-[11px] text-ink-muted">{g.id.slice(0, 8)}</code>
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={g.tier === "member" ? "member" : "card"}>
                        {g.tier === "member" ? "Member" : "Card"}
                      </Pill>
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {g.segment ? SEGMENT_LABEL[g.segment] : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-secondary">{BAND_LABEL[g.valueBand - 1]}</td>
                    {/* Grids never round. */}
                    <td className="tnum px-3 py-2 text-right">{g.visits}</td>
                    <td className="tnum px-3 py-2 text-right">{money(g.spend)}</td>
                    <td className="tnum px-3 py-2 text-right text-ink-secondary">{g.daysSince}d ago</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {org.dayparts.find((d) => d.key === g.homeDaypart)?.label ?? "—"}
                    </td>
                    <td className="px-5 py-2 text-ink-secondary">
                      {g.homeStore}
                      {g.venues > 1 && (
                        <span className="ml-1.5 text-[11px] text-ink-muted" title={`Visits ${g.venues} venues`}>
                          +{g.venues - 1}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="max-w-[70ch] text-[12px] leading-relaxed text-ink-muted">
            The grid works on a {count(guests.sampled)}-row working set of the {count(guests.population)} known{" "}
            {org.labels.guests} — the top of the value distribution in full, plus a deterministic hash-ordered
            sample of the rest. Every figure above the grid is computed on the whole population, never on this
            set. Names are masked by default; in production the reveal is role-gated and audit-logged, and every
            export carries the same control.
          </p>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-40 hover:bg-surface-hover"
              >
                ←
              </button>
              <span className="tnum text-[12px] text-ink-secondary">
                {safePage + 1} of {pages}
              </span>
              <button
                type="button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-medium disabled:opacity-40 hover:bg-surface-hover"
              >
                →
              </button>
            </div>
          )}
        </div>
      </Card>

      {open && (
        <Drawer
          guest={open}
          org={org}
          unmasked={unmasked}
          crossVenueShare={crossVenueShare}
          onClose={() => setOpen(null)}
          onPrev={index > 0 ? () => setOpen(filtered[index - 1]) : undefined}
          onNext={index >= 0 && index < filtered.length - 1 ? () => setOpen(filtered[index + 1]) : undefined}
        />
      )}
    </>
  );
}

function Choice({
  label, value, onChange, options, disabled, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      title={hint}
      className={`flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent font-medium text-ink outline-none disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Drawer({
  guest: g, org, unmasked, crossVenueShare, onClose, onPrev, onNext,
}: {
  guest: Guest;
  org: Org;
  unmasked: boolean;
  crossVenueShare: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const oneVisit = g.visits === 1;
  const rhythm = habit(g);
  const overdue = overdueRatio(g);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/25" />
      <aside className="flex w-[440px] max-w-full flex-col overflow-y-auto border-l border-line bg-surface-raised">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold text-ink">{unmasked ? g.name : mask(g.name)}</h2>
              <Pill tone={g.tier === "member" ? "member" : "card"}>
                {g.tier === "member" ? "Member" : "Card"}
              </Pill>
            </div>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              <code>{g.id}</code> · {g.homeStore}
              {g.segment ? ` · ${SEGMENT_LABEL[g.segment]}` : ""}
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
                    Came in on {g.firstSeen ? dayLabel(g.firstSeen) : "—"}, spent {money(g.spend)}, and has not
                    been back in {g.daysSince} days.
                  </p>
                  <p className="mt-2">
                    There is no habit here to be early or late against, so no lifecycle verdict is shown and no
                    usual gap is invented. This is the largest single group in the business and the only useful
                    question about it is whether a second visit can be caused.
                  </p>
                </>
              }
            />
          ) : (
            <>
              <Facts
                rows={[
                  [`${org.labels.visits[0].toUpperCase()}${org.labels.visits.slice(1)}`, String(g.visits)],
                  ["Orders", String(g.orders)],
                  ["Items", String(g.items)],
                  ["Total spend", money(g.spend)],
                  ["Average per visit", money(g.spend / g.visits)],
                  ...(g.covers > 0 ? ([["Covers recorded", String(g.covers)]] as [string, string][]) : []),
                  ["Usual gap", g.cadenceDays && g.visits >= 3 ? `${Math.round(g.cadenceDays)} days` : "not yet estimable"],
                  ["Last seen", `${g.daysSince} days ago`],
                  ["First seen", g.firstSeen ? dayLabel(g.firstSeen) : "—"],
                  ["Known for", `${g.tenureDays} days`],
                  ["Venues visited", String(g.venues)],
                  ["Usual time of day", org.dayparts.find((d) => d.key === g.homeDaypart)?.label ?? "—"],
                  ["Value band", `${BAND_LABEL[g.valueBand - 1]} fifth`],
                  ...(g.tier === "member"
                    ? ([["Scanned", `${g.scannedOrders} of ${g.orders} orders`]] as [string, string][])
                    : []),
                ]}
              />
              {rhythm && (
                <div className="rounded-lg border border-line p-3">
                  <p className="text-[13px] leading-relaxed text-ink">
                    {rhythm}
                    {overdue !== null && overdue > 1.5 && (
                      <>
                        {" "}— <strong>{overdue.toFixed(1)}× their own usual gap</strong>.
                      </>
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Measured against this person&apos;s own cadence over {g.visits} {org.labels.visits}, not
                    against a rule applied to everybody.
                  </p>
                </div>
              )}
            </>
          )}

          {g.visits === 2 && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <p className="text-[13px] font-medium text-ink">Two visits, one gap</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                A single observed interval is not enough to say whether a habit has formed or broken, so no
                verdict is shown. A third visit makes them classifiable.
              </p>
            </div>
          )}

          {g.tier === "card" && (
            <div className="rounded-lg border border-line bg-surface-sunken p-3">
              <p className="text-[13px] font-medium text-ink">Recognised, not identified</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
                Recognised by the card they pay with. There is no name, email or phone — and no lifecycle
                verdict, because a reissued card looks exactly like a customer who stopped coming. What you can
                do is recognise them at the counter and ask them to join.
              </p>
            </div>
          )}

          {g.venues > 1 && (
            <div className="rounded-lg border border-line p-3">
              <p className="text-[13px] leading-relaxed text-ink">
                Visits <strong>{g.venues}</strong> of your venues. Guests who cross venues are{" "}
                {pct(crossVenueShare, 1)} of the identified population here, and they are invisible to a
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
