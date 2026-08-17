"use client";

/**
 * R-189. The build is instrumented before POC 3 scope locks.
 *
 * ── The constraint, and it decides the design ──────────────────────────────
 *
 * The app has **no environment variables, no API key and no runtime network
 * calls by design**. That property is what makes it deployable and demo-safe,
 * and it is worth more than any analytics vendor. So instrumentation records
 * locally and is read out on demand; nothing is sent anywhere.
 *
 * This is a real trade and it is stated rather than hidden: what we get is
 * per-session behaviour readable during a moderated session or exported by the
 * person sitting in front of it, and what we do not get is aggregate telemetry
 * across users. For the question R-189 exists to answer — *does anybody reach
 * the method sections, and does anybody move the sliders* — a moderated session
 * with five operators answers it better than a funnel chart would, and the four
 * operator tests in the acceptance criteria are moderated sessions anyway.
 *
 * If aggregate telemetry is later wanted, it goes in a build variant that is
 * never the demo build, and that decision gets a register entry.
 *
 * ── What is recorded ───────────────────────────────────────────────────────
 *
 * Page views and dwell per surface, scroll depth on the dense pages, drawer
 * opens, filter interactions, **slider interactions** and method-section
 * reveals. Sliders arrive in Phase 4; the event exists now so Phase 4 ships
 * instrumented on its first day rather than acquiring it later.
 *
 * No guest id, no name, no reference and no search text is ever recorded — a
 * local log is still a record of who somebody looked at.
 */

export type EventName =
  | "surface.view"
  | "surface.dwell"
  | "surface.scrollDepth"
  | "drawer.open"
  | "filter.change"
  | "filter.clear"
  | "scope.change"
  | "list.save"
  | "slider.change"
  | "method.reveal"
  | "refusal.reveal";

export type Event = {
  name: EventName;
  /** The surface, never a URL — a URL carries filter values and a guest id. */
  surface: string;
  /** A bounded label: which filter, which slider. Never the value chosen. */
  detail?: string;
  value?: number;
  at: number;
};

const KEY = "guests.instrumentation.v1";
const LIMIT = 2000;

function load(): Event[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? "[]") as Event[];
  } catch {
    return [];
  }
}

function save(events: Event[]) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(events.slice(-LIMIT)));
  } catch {
    // A full or disabled storage must never break a surface. Instrumentation is
    // the least important thing on the page.
  }
}

/**
 * Record an event.
 *
 * `detail` is a control name, not a control value: knowing that the daypart
 * filter was used answers R-189's question, and knowing which daypart was
 * chosen starts to describe the operator's own trade back to whoever reads the
 * log.
 */
export function track(name: EventName, surface: string, detail?: string, value?: number) {
  if (typeof window === "undefined") return;
  const events = load();
  events.push({ name, surface, detail, value, at: Date.now() });
  save(events);
}

export function readEvents(): Event[] {
  return load();
}

export function clearEvents() {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(KEY);
}

/**
 * The session, summarised the way the four operator tests want to read it.
 *
 * Deliberately a rollup rather than a raw dump: the question is never "what was
 * event 41" but "did they reach the method section, and did they move the
 * slider".
 */
export function summarise(events: Event[] = load()) {
  const bySurface = new Map<string, { views: number; dwellMs: number; maxScroll: number }>();
  const counts = new Map<EventName, number>();

  for (const e of events) {
    counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    const s = bySurface.get(e.surface) ?? { views: 0, dwellMs: 0, maxScroll: 0 };
    if (e.name === "surface.view") s.views++;
    if (e.name === "surface.dwell") s.dwellMs += e.value ?? 0;
    if (e.name === "surface.scrollDepth") s.maxScroll = Math.max(s.maxScroll, e.value ?? 0);
    bySurface.set(e.surface, s);
  }

  return {
    events: events.length,
    surfaces: [...bySurface.entries()].map(([surface, s]) => ({ surface, ...s })),
    drawerOpens: counts.get("drawer.open") ?? 0,
    filterInteractions: counts.get("filter.change") ?? 0,
    scopeChanges: counts.get("scope.change") ?? 0,
    sliderInteractions: counts.get("slider.change") ?? 0,
    /** The one R-189 was written to answer. */
    reachedMethod: (counts.get("method.reveal") ?? 0) > 0,
    reachedRefusal: (counts.get("refusal.reveal") ?? 0) > 0,
  };
}
