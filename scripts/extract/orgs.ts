/**
 * The organisations the POC can present.
 *
 * Coffee Guru is the base mark: 20 venues, card-dense, loyalty running, two full
 * years of trade. Meat Flour Wine is the restaurant contrast — table service,
 * covers recorded, far lower enrolment.
 */
export type OrgConfig = {
  slug: string;
  id: string;
  name: string;
  vertical: "cafe" | "restaurant";
  /** Counter service records no party size; table service does. It changes which
   *  questions the data can answer, so it is a first-class property, not a note. */
  serviceModel: "counter" | "table";
  /** Display label map, per PRD §6.1 "Oolio defines its own taxonomy". */
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
 * The analysis window. 24 complete months plus the current partial month, so the
 * 24-month trend (MQ7) always has a same-month-last-year comparator.
 */
export function analysisWindow(today = new Date()) {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // First day of the month 23 months before the last *complete* month.
  const lastComplete = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const start = new Date(Date.UTC(lastComplete.getUTCFullYear(), lastComplete.getUTCMonth() - 23, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Lapse threshold in days. Canonical value; the calibrated value is computed per org. */
export const CANONICAL_LAPSE_DAYS = 90;

/** A card seen more than this many times in a single day is not a guest. */
export const NON_GUEST_VISITS_PER_DAY = 1;
