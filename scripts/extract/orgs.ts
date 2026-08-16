/**
 * The organisations the POC can present, and the vocabulary shared across it.
 *
 * Coffee Guru is the base mark: 20 venues, card-dense, loyalty running. Meat
 * Flour Wine is the restaurant contrast — table service, covers recorded, far
 * lower enrolment. The pair is the argument: the same report has to work for a
 * daily-habit counter business and a monthly-occasion table-service one.
 */
export type OrgConfig = {
  slug: string;
  id: string;
  name: string;
  vertical: "cafe" | "restaurant";
  /** Counter service records no party size; table service does. It changes which
   *  questions the data can answer, so it is a first-class property, not a note. */
  serviceModel: "counter" | "table";
  labels: { visit: string; visits: string; guest: string; guests: string };
};

export const ORGS: OrgConfig[] = [
  {
    slug: "coffee-guru",
    id: "01HZPS1KTK78BC50NPH7TBYMYF",
    name: "Coffee Guru",
    vertical: "cafe",
    serviceModel: "counter",
    labels: { visit: "visit", visits: "visits", guest: "guest", guests: "guests" },
  },
  {
    slug: "meat-flour-wine",
    id: "01JQ7QED4TAZTQS085NTV84C8T",
    name: "Meat Flour Wine",
    vertical: "restaurant",
    serviceModel: "table",
    labels: { visit: "visit", visits: "visits", guest: "guest", guests: "guests" },
  },
];

/**
 * The discovery window. Deliberately wider than the analysis window: the store
 * map and the card-quality grading both need history to see the failure, and the
 * card outage is only legible against the months either side of it.
 *
 * The *analysis* window is narrower and is derived, not declared — see
 * `analysisWindow()`. Build v1 published two years of chrome over four months of
 * usable card data, which is how eighteen figures came to contradict each other.
 */
export function discoveryWindow(today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const lastComplete = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(lastComplete.getUTCFullYear(), lastComplete.getUTCMonth() - 23, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/**
 * The honest window: the most recent unbroken run of months in which the card
 * tier is trustworthy, truncated to complete months only.
 *
 * Nothing in the product may render outside it. This is the mechanism behind
 * handover item 2 — a figure cannot be quietly computed over a period the data
 * does not support, because the period is not in the snapshot at all.
 */
export function analysisWindow(cardMonths: string[], today = new Date()) {
  const months = [...cardMonths].sort();
  if (!months.length) throw new Error("No trustworthy card months — cannot open an analysis window");

  const step = (m: string, back: number) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - back);
    return d.toISOString().slice(0, 10);
  };

  // Walk back from the most recent month while the run stays contiguous.
  let i = months.length - 1;
  while (i > 0 && months[i - 1] === step(months[i], 1)) i--;

  // The trailing month is partial unless today is the last day of it. Headline
  // figures never use a partial month, so it is excluded from the window rather
  // than carried and flagged.
  const lastMonth = months[months.length - 1];
  const inLastMonth = today.toISOString().slice(0, 7) === lastMonth.slice(0, 7);
  const runEnd = inLastMonth ? months[months.length - 2] ?? months[months.length - 1] : lastMonth;

  const start = months[i] > runEnd ? runEnd : months[i];
  const endDate = new Date(`${runEnd}T00:00:00Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0); // last day of runEnd's month
  const end = endDate.toISOString().slice(0, 10);

  const completeMonths = months.filter((m) => m >= start && m <= runEnd).length;
  return { start, end, months: completeMonths };
}

/**
 * The eight standard dayparts, from the Trade Density Framework. These are the
 * common time vocabulary across all Oolio reporting, not a local invention —
 * which is why they are declared once here and read by both SQL and UI.
 *
 * Windows are evaluated in venue local time. CREATED_AT_TZ is already localised;
 * CREATED_AT is not, and using it silently shifts a Sydney dinner into Late
 * Evening.
 */
export const DAYPARTS = [
  { key: "pre-dawn", label: "Pre-Dawn", from: 4, to: 6 },
  { key: "breakfast", label: "Breakfast", from: 6, to: 10 },
  { key: "mid-morning", label: "Mid-Morning", from: 10, to: 12 },
  { key: "lunch", label: "Lunch", from: 12, to: 14 },
  { key: "afternoon", label: "Afternoon", from: 14, to: 17 },
  { key: "dinner", label: "Dinner", from: 17, to: 21 },
  { key: "late-evening", label: "Late Evening", from: 21, to: 24 },
  { key: "late-night", label: "Late Night", from: 0, to: 4 },
] as const;

/** Density tiers, on both order count and revenue. */
export const DENSITY_TIERS = [
  { key: "primary", label: "PRIMARY", min: 0.25 },
  { key: "secondary", label: "SECONDARY", min: 0.15 },
  { key: "tertiary", label: "TERTIARY", min: 0.05 },
  { key: "weak", label: "WEAK", min: 0 },
] as const;

/** SQL fragment assigning a daypart key to a localised timestamp column. */
export function daypartCase(ts: string): string {
  const arms = DAYPARTS.filter((d) => d.key !== "late-night").map(
    (d) => `WHEN HOUR(${ts}) >= ${d.from} AND HOUR(${ts}) < ${d.to} THEN '${d.key}'`,
  );
  return `CASE ${arms.join(" ")} ELSE 'late-night' END`;
}

/** Lapse threshold in days. Canonical value; the calibrated value is estimated per org. */
export const CANONICAL_LAPSE_DAYS = 90;

/** A card seen more than this many times in a single day is not a guest. */
export const NON_GUEST_VISITS_PER_DAY = 1;

/**
 * A lifecycle verdict needs three visits. With two you have exactly one gap, and
 * "their habit has broken" is not estimable from a single observation — handover
 * §5.5 fault 3. Below this a guest is New, or nothing.
 */
export const MIN_VISITS_FOR_LIFECYCLE = 3;
