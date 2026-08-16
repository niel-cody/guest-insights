/**
 * The URL parameter contract. Release blocker B2.
 *
 * ── The defect being fixed ─────────────────────────────────────────────────
 *
 * On the shipped build, `?daypart=lunch` showed **Daypart = All and 17,015
 * matches on a cold load**, and Lunch and 3,148 on a soft one. The filter
 * survived in the URL and was then ignored, which is worse than dropping it:
 * the link looked like it worked. No view could be shared or bookmarked, and a
 * V2 shipped without the test that would have caught it.
 *
 * ── Why this shape ─────────────────────────────────────────────────────────
 *
 * The fix is not "read the query string on mount as well as on navigation".
 * That reproduces the defect's shape — two sources of truth reconciled — and
 * leaves the cold and warm paths free to diverge again.
 *
 * Instead **the URL is the only source of filter state, and it is resolved on
 * the server**. A surface receives `searchParams`, calls `parseView`, and
 * renders. There is no component-local default to reconcile against, so a cold
 * load and a soft navigation run identical code by construction. The class of
 * bug is removed rather than patched.
 *
 * ── The contract ───────────────────────────────────────────────────────────
 *
 * Parameter names are fixed here in Phase 0 and consumed unchanged by later
 * phases. `venue` and `compare` are reserved now and populated by the Phase 1
 * scope bar; they are parsed and round-tripped from this phase so that the
 * scope bar inherits working URL state rather than adding it.
 *
 * Unknown or malformed parameters degrade to the default view and never throw —
 * a shared link that has been through a mail client should show the default
 * report, not a stack trace.
 */

export const VALUE_BANDS = [1, 2, 3, 4, 5] as const;

export const SEGMENTS = [
  "regular", "established", "slipping", "lapsed", "new", "one-visit",
] as const;

export const TIERS = ["member", "card"] as const;

/**
 * The resolved view. Every field is always present, so no consumer writes a
 * fallback — a `??` in a surface is how a default creeps back in beside the URL.
 */
export type View = {
  /** Store ids. Empty means the whole group, which is the default scope. */
  venue: string[];
  /** A sibling store id to compare the scoped venue against. Phase 1. */
  compare: string | null;
  segment: (typeof SEGMENTS)[number] | null;
  tier: (typeof TIERS)[number] | null;
  daypart: string | null;
  band: number | null;
  /** The guest whose drawer is open. In the URL so a drawer can be sent. */
  guest: string | null;
  /** Free-text search over the guest grid. */
  q: string;
  page: number;
  sort: string | null;
  dir: "asc" | "desc";
};

export const DEFAULT_VIEW: View = {
  venue: [], compare: null, segment: null, tier: null, daypart: null,
  band: null, guest: null, q: "", page: 1, sort: null, dir: "desc",
};

/** What Next.js hands a server component. A repeated parameter arrives as an array. */
export type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const all = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : v.split(",");

function oneOf<T extends string>(v: string | undefined, allowed: readonly T[]): T | null {
  if (!v) return null;
  const hit = allowed.find((a) => a === v);
  return hit ?? null;
}

/**
 * Resolve a view from the URL. Total: any input produces a valid view.
 *
 * Malformed values are dropped rather than corrected. Correcting them invents a
 * view the sender did not ask for, and the sender is usually a colleague who
 * pasted a link into chat.
 */
export function parseView(sp: SearchParams | undefined): View {
  if (!sp) return { ...DEFAULT_VIEW };

  const pageRaw = Number(first(sp.page));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const bandRaw = Number(first(sp.band));
  const band = VALUE_BANDS.includes(bandRaw as never) ? bandRaw : null;

  const q = (first(sp.q) ?? "").slice(0, 120).trim();

  return {
    venue: all(sp.venue).map((s) => s.trim()).filter(Boolean).slice(0, 40),
    compare: first(sp.compare)?.trim() || null,
    segment: oneOf(first(sp.segment), SEGMENTS),
    tier: oneOf(first(sp.tier), TIERS),
    // The daypart vocabulary is a property of the snapshot, not of this module,
    // so it is validated by the surface against the org's own daypart set. A
    // fixed list here would silently drop a daypart the moment CI-025 settles.
    daypart: first(sp.daypart)?.trim() || null,
    band,
    guest: first(sp.guest)?.trim() || null,
    q,
    page,
    sort: first(sp.sort)?.trim() || null,
    dir: first(sp.dir) === "asc" ? "asc" : "desc",
  };
}

/**
 * Serialise a view back to a query string, omitting anything at its default.
 *
 * Omitting defaults matters: a URL that carries every parameter at its default
 * value is unreadable, and an operator who cannot read the link does not trust
 * that it carries what the screen showed.
 */
export function toQuery(view: Partial<View>): string {
  const v = { ...DEFAULT_VIEW, ...view };
  const p = new URLSearchParams();
  for (const id of v.venue) p.append("venue", id);
  if (v.compare) p.set("compare", v.compare);
  if (v.segment) p.set("segment", v.segment);
  if (v.tier) p.set("tier", v.tier);
  if (v.daypart) p.set("daypart", v.daypart);
  if (v.band != null) p.set("band", String(v.band));
  if (v.guest) p.set("guest", v.guest);
  if (v.q) p.set("q", v.q);
  if (v.page > 1) p.set("page", String(v.page));
  if (v.sort) p.set("sort", v.sort);
  if (v.sort && v.dir !== "desc") p.set("dir", v.dir);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A link that preserves the current view and changes one thing. */
export function withView(base: string, view: View, patch: Partial<View>): string {
  return `${base}${toQuery({ ...view, ...patch })}`;
}

/** True when a view filters the population at all. Drives the "clear filters" affordance. */
export function isFiltered(v: View): boolean {
  return Boolean(
    v.venue.length || v.segment || v.tier || v.daypart || v.band != null || v.q,
  );
}

/** The active filters, for the chip row that states what the reader is looking at. */
export function activeFilters(v: View): { key: keyof View; label: string; value: string }[] {
  const out: { key: keyof View; label: string; value: string }[] = [];
  if (v.venue.length) out.push({ key: "venue", label: "Venue", value: `${v.venue.length} selected` });
  if (v.segment) out.push({ key: "segment", label: "Segment", value: v.segment });
  if (v.tier) out.push({ key: "tier", label: "Identity", value: v.tier });
  if (v.daypart) out.push({ key: "daypart", label: "Daypart", value: v.daypart });
  if (v.band != null) out.push({ key: "band", label: "Value band", value: `Band ${v.band}` });
  if (v.q) out.push({ key: "q", label: "Search", value: v.q });
  return out;
}
