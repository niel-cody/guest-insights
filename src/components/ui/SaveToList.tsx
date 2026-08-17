"use client";

import { useEffect, useState } from "react";
import type { Guest, Org } from "@/lib/types";
import type { View } from "@/lib/url-state";
import { activeFilters, toQuery } from "@/lib/url-state";
import { count, dayLabel, pct } from "@/lib/metrics";
import { track } from "@/lib/instrument";
import { Pill } from "@/components/ui/Primitives";

/**
 * §7.4. Save to list. **One action, not five.**
 *
 * ── A list is a rule, not a set of ids ─────────────────────────────────────
 *
 * What gets stored is the **view** — the filters that selected the population —
 * and the scope those filters were written in. The membership is evaluated on
 * read, every time, against the current rows. A frozen list of ids is a
 * photograph that starts lying the next morning: guests slip, lapse and return,
 * and "Slipping regulars at Belconnen" from three weeks ago is a list of people
 * some of whom are no longer either.
 *
 * ── It records its scope, or it is not reproducible ────────────────────────
 *
 * Venue selection, window and tier travel with the rule. Without them "Regulars"
 * is meaningless — regular where, over what, measured how — and two people
 * comparing lists of the same name would be comparing different populations.
 *
 * ── It cannot mix tiers ────────────────────────────────────────────────────
 *
 * A member-tier list and a card-tier list are different populations on different
 * clocks, and a list spanning both would be the one place in the product where
 * §4.3's wall could be walked around. A list saved with no tier filter is stored
 * as the tier the rule actually resolves to, and a mixed selection is refused
 * with the reason rather than silently split.
 *
 * ── Reachability sits next to size ─────────────────────────────────────────
 *
 * A card-recognised guest has no email and no phone, because Oolio holds
 * neither. **A list of 19,940 people of whom 0 are contactable is a very
 * different object from one of 4,966 of whom most are**, and an operator who
 * discovers that after building a campaign has been misled by the size alone.
 *
 * ── Nothing leaves ─────────────────────────────────────────────────────────
 *
 * No export, no download, no clipboard, no send, no hand-off to Loyalty. Names
 * are masked exactly as they are on screen. The list is read-only in this
 * version and says so on its face — a list you cannot act on that looks like one
 * you can is worse than no list at all.
 */

export type SavedList = {
  id: string;
  name: string;
  /** The rule. Evaluated on read — never a frozen set of ids. */
  rule: Partial<View>;
  scope: {
    org: string;
    period: string;
    windowStart: string;
    windowEnd: string;
    venues: string[];
    tier: "member" | "card";
  };
  createdAt: string;
};

const KEY = "guests.lists.v1";

function load(): SavedList[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as SavedList[];
  } catch {
    return [];
  }
}

function save(lists: SavedList[]) {
  window.localStorage.setItem(KEY, JSON.stringify(lists));
}

/**
 * The tier a population actually resolves to, or null when it spans both.
 *
 * Derived from the rows rather than from the filter, because a rule with no
 * explicit tier can still select one — "seen once at Belconnen" is card-tier in
 * practice — and storing the tier that was *asked for* rather than the one that
 * came back is how a list ends up mislabelled.
 */
export function resolvedTier(rows: Guest[]): "member" | "card" | null {
  if (!rows.length) return null;
  const first = rows[0].tier;
  return rows.every((r) => r.tier === first) ? first : null;
}

export function SaveToList({
  view, rows, org, period, label,
}: {
  view: View;
  /** The population the current rule selects. Used for size, tier and reach. */
  rows: Guest[];
  org: Org;
  period: string;
  label?: string;
}) {
  const [lists, setLists] = useState<SavedList[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => setLists(load()), []);

  const tier = resolvedTier(rows);
  // Only enrolled people have a member record, and therefore a way to be
  // reached at all. Card-recognised guests have none — not a missing email, no
  // record to hold one.
  const reachable = rows.filter((r) => r.tier === "member").length;
  const filters = activeFilters(view);

  const suggested =
    label ??
    (filters.length
      ? filters.map((f) => `${f.label} ${f.value}`).join(" · ")
      : `All ${org.labels.guests}`);

  function commit() {
    if (!tier) return;
    const entry: SavedList = {
      id: `${Date.now()}`,
      name: (name || suggested).slice(0, 80),
      rule: {
        venue: view.venue, segment: view.segment, tier: view.tier, daypart: view.daypart,
        band: view.band, minVisits: view.minVisits, minVenues: view.minVenues, q: view.q,
      },
      scope: {
        org: org.slug,
        period,
        windowStart: org.window.start,
        windowEnd: org.window.end,
        venues: view.venue,
        tier,
      },
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...lists].slice(0, 20);
    setLists(next);
    save(next);
    setName("");
    track("list.save", "guests", "save");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink-secondary hover:bg-surface-hover"
      >
        Save to list
        {lists.length > 0 && <span className="ml-1.5 text-ink-muted">({lists.length})</span>}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-40 mt-2 w-[440px] rounded-xl border border-line bg-surface-raised p-4 shadow-lg">
          <h3 className="text-[14px] font-semibold text-ink">Save this population as a list</h3>

          {/* Size and reach together. Never size alone. */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="People in this list" value={count(rows.length)} />
            <Stat
              label="Reachable"
              value={count(reachable)}
              tone={reachable === 0 ? "var(--warning)" : undefined}
              sub={rows.length ? pct(reachable / rows.length, 0) : "—"}
            />
          </div>

          {reachable < rows.length && (
            <p className="mt-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-secondary">
              {reachable === 0 ? (
                <>
                  <strong className="text-ink">Nobody in this list is contactable.</strong> Every one of them
                  is recognised by their payment card and has never enrolled, so Oolio holds no name, email
                  or phone for them.
                </>
              ) : (
                <>
                  {count(rows.length - reachable)} of these are card-recognised guests with no member record,
                  so there is no email or phone for them.
                </>
              )}{" "}
              A card-only guest <strong className="text-ink">cannot be added to a member group</strong> —
              there is no member record to add. The only way to reach them is to recognise them at the
              counter.
            </p>
          )}

          {/* The tier rule, enforced rather than described. */}
          {tier === null && rows.length > 0 && (
            <p
              className="mt-3 rounded-lg border border-dashed px-3 py-2 text-[12px] leading-relaxed text-ink-secondary"
              style={{ borderColor: "var(--warning)" }}
            >
              <strong className="text-ink">This selection spans both tiers and cannot be saved.</strong>{" "}
              Enrolled members are measured on the loyalty scan and card-recognised guests on the payment
              card — two populations on two clocks. Filter to one tier and the list becomes saveable.
            </p>
          )}

          <label className="mt-3 block">
            <span className="text-[12px] font-medium text-ink-secondary">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggested}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="mt-2 rounded-lg border border-line bg-surface-sunken px-3 py-2">
            <p className="text-[11px] font-medium tracking-wide text-ink-secondary uppercase">
              Scope recorded with the rule
            </p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
              <dt className="text-ink-muted">Rule</dt>
              <dd className="truncate text-right text-ink">
                <code className="text-[11px]">{toQuery(view) || "no filters"}</code>
              </dd>
              <dt className="text-ink-muted">Window</dt>
              <dd className="tnum text-right text-ink">
                {dayLabel(org.window.start)} – {dayLabel(org.window.end)}
              </dd>
              <dt className="text-ink-muted">Locations</dt>
              <dd className="text-right text-ink">
                {view.venue.length ? `${view.venue.length} selected` : `all ${org.venues.length}`}
              </dd>
              <dt className="text-ink-muted">Tier</dt>
              <dd className="text-right text-ink">{tier ?? "mixed"}</dd>
            </dl>
          </div>

          <button
            type="button"
            disabled={tier === null || rows.length === 0}
            onClick={commit}
            className="mt-3 w-full rounded-lg px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            Save list
          </button>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink-secondary">Read-only in this version.</strong> The list is a rule,
            re-evaluated every time it is opened, so it is always current rather than a photograph. Names
            stay masked. Nothing exports, downloads, copies or sends, and nothing is handed to Loyalty.
          </p>

          {lists.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <p className="text-[11px] font-medium tracking-wide text-ink-secondary uppercase">
                Saved lists
              </p>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {lists.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-2 text-[12px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{l.name}</p>
                      <p className="tnum text-[11px] text-ink-muted">
                        {dayLabel(l.scope.windowStart)} – {dayLabel(l.scope.windowEnd)} ·{" "}
                        {l.scope.venues.length ? `${l.scope.venues.length} locations` : "all locations"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Pill tone={l.scope.tier === "member" ? "member" : "card"}>{l.scope.tier}</Pill>
                      <button
                        type="button"
                        onClick={() => {
                          const next = lists.filter((x) => x.id !== l.id);
                          setLists(next);
                          save(next);
                        }}
                        className="text-ink-muted hover:text-ink"
                        aria-label={`Remove ${l.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[11px] font-medium tracking-wide text-ink-secondary uppercase">{label}</p>
      <p className="tnum text-[20px] leading-none font-semibold" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}
