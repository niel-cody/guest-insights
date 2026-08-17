/** Shapes of the extracted snapshot. Mirrors what scripts/extract writes. */

/**
 * The identity a person was resolved through.
 *
 * `member` means the business knows who they are — either because they scanned,
 * or because the card they paid with has been seen on a scan before. `card`
 * means a returning payment instrument with no enrolment behind it. These are
 * two states of one population, not two populations: see `scripts/extract/sql.ts`.
 */
export type Tier = "member" | "card" | "unattributed";

/**
 * A lifecycle verdict. Only ever populated for members — card reissue is
 * unmeasured and looks identical to churn, so the field is null at source for
 * everyone else rather than being suppressed in the UI.
 */
export type Segment = "regular" | "established" | "slipping" | "lapsed" | "new" | "one-visit";

export type Venue = {
  id: string;
  name: string;
  venueName: string;
  /** Earlier names for the same store id. A venue is its id, never its name. */
  formerNames: string[];
  orders: number;
  firstDay: string | null;
  lastDay: string | null;
};

/**
 * One month's card-capture verdict, computed at load time by `scripts/grade.ts`.
 *
 * `coverage` and `ratio` measure different failures and both are kept. A month
 * at 33% coverage whose covered rows are impeccable is usable with a correction;
 * a month at 95% coverage whose references are three recycled tokens is not
 * usable at all, and a single "quality" score would rank them the same way.
 */
export type ParMonth = {
  month: string;
  txns: number;
  orders: number;
  distinctPar: number;
  /** Transactions carrying a *real* reference. The `'N/A'` placeholder is not one. */
  withPar: number;
  /** Distinct references per transaction that carries one. */
  ratio: number;
  /** Share of transactions carrying a real reference at all. */
  coverage: number;
  /** Share of real references sitting on the single most frequent one. */
  maxTokenShare: number;
  ok: boolean;
  reason: string | null;
};

/** R-205. What the loaded window entitles a surface to claim. */
export type ClaimLevel = "none" | "growth" | "trend";

export type SurvivalPointOut = { days: number; s: number; se: number; atRisk: number };

export type Calibration = {
  method: "kaplan-meier";
  episodes: number;
  returned: number;
  horizonDays: number;
  floor: number;
  medianGapDays: number | null;
  p75: number | null;
  p90: number | null;
  slippingDays: number | null;
  lapsedDays: number;
  /** False when the observation window closes before the curve reaches p90. */
  lapsedEstimable: boolean;
  canonicalLapsedDays: number;
  curve: SurvivalPointOut[];
};

export type AnalysisWindow = { start: string; end: string; months: number; days: number };

export type Daypart = { key: string; label: string; from: number; to: number };

export type Org = {
  slug: string;
  id: string;
  name: string;
  vertical: "cafe" | "restaurant";
  serviceModel: "counter" | "table";
  labels: { visit: string; visits: string; guest: string; guests: string };
  window: AnalysisWindow;
  discoveryWindow: { start: string; end: string };
  extractedAt: string;
  venues: Venue[];
  calibration: Calibration;
  storeMap: { terminals: number; venuesResolved: number };
  cardTier: {
    months: string[];
    allUsableMonths: string[];
    quality: ParMonth[];
    /** Complete months graded. A partial month is never counted. C1. */
    monthsTested: number;
    /** Complete months that passed the grading. Not the same as the window. */
    monthsUsable: number;
    /** The partial month held back from the count, when it would otherwise have passed. */
    partialMonthExcluded: string | null;
    /** The longest clean run anywhere in history, which may not reach the present. */
    longestRun: { start: string; end: string; months: number } | null;
    claim: ClaimLevel;
  };
  orderStatuses: { status: string; training: boolean; orders: number; revenue: number; zeroValue: number }[];
  dayparts: Daypart[];
};

export type CoverageTotals = {
  orders: number;
  revenue: number;
  memberOrders: number;
  memberRevenue: number;
  scannedOrders: number;
  scannedRevenue: number;
  cardOrders: number;
  cardRevenue: number;
  unattributedOrders: number;
  unattributedRevenue: number;
  ordersWithCovers: number;
  covers: number;
};

export type Coverage = {
  totals: CoverageTotals;
  byVenue: (CoverageTotals & { storeId: string; storeName: string })[];
  monthly: {
    month: string;
    orders: number;
    revenue: number;
    memberRevenue: number;
    scannedRevenue: number;
    cardRevenue: number;
    memberOrders: number;
    scannedOrders: number;
    cardOrders: number;
  }[];
};

export type LifecycleRow = {
  month: string;
  tier: "member" | "card";
  new: number;
  returning: number;
  reactivated: number;
  active: number;
  lapsed: number;
  revenue: number;
  visits: number;
};

export type DecompositionRow = {
  month: string;
  guests: number;
  visits: number;
  revenue: number;
  items: number;
  visitsPerGuest: number;
  spendPerVisit: number;
  itemsPerVisit: number;
  pricePerItem: number;
};

export type SegmentRow = {
  tier: "member" | "card";
  segment: Segment | null;
  valueBand: number;
  guests: number;
  visits: number;
  spend: number;
  minSpend: number;
  maxSpend: number;
  avgVisits: number;
  avgSpend: number;
  multiVenue: number;
};

export type Segments = {
  population: number;
  rows: SegmentRow[];
  gapHistogram: { days: number; n: number }[];
};

export type Guest = {
  id: string;
  /**
   * Null for anyone who has not enrolled. A name is a claim to know who somebody
   * is, and a recognised payment card is not one — the surface renders a
   * reference for those rows rather than inventing a person.
   */
  name: string | null;
  tier: "member" | "card";
  segment: Segment | null;
  valueBand: number;
  visits: number;
  venues: number;
  spend: number;
  orders: number;
  items: number;
  scannedOrders: number;
  covers: number;
  homeDaypart: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  daysSince: number;
  tenureDays: number;
  cadenceDays: number | null;
  homeStoreId: string;
  homeStore: string;
  spendRank: number;
  /** Top three products as [productIndex, visitsBoughtOn]. Indexes `items.products`. */
  top: [number, number][];
  /** Top three categories as [categoryIndex, visits, spend]. Indexes `items.categories`. */
  cats: [number, number, number][];
  /** Distinct products ever bought. Three across thirty visits is a habit; forty is a browser. */
  repertoire: number;
  /** Share of their visits carrying their single most-bought product. */
  topShare: number | null;
  /**
   * Most recent visits as [dayOffsetFromWindowStart, orders, spend, venueIndex],
   * capped. `visits` above is the uncapped total, so a truncated timeline can
   * never be mistaken for the whole relationship.
   */
  history: [number, number, number, number][];
};

/**
 * The guest working set as it sits on disk and crosses the wire: columnar, so
 * the twenty-five field names are carried once rather than seventeen thousand
 * times. `unpackGuests` turns it back into rows. See `lib/guest-columns.ts`.
 */
export type Guests = { sampled: number; population: number; fields: string[]; rows: unknown[][] };

/** The same set, expanded. What every consumer actually works with. */
export type GuestRows = { sampled: number; population: number; rows: Guest[] };

// ── the member value model ──────────────────────────────────────────────────

export type ValueSide = {
  people: number;
  visits: number;
  spend: number;
  orders: number;
  scannedOrders: number;
  scannedVisits: number;
  scanPerVisit: number;
  covers: number;
  avgVisits: number;
  medianVisits: number;
  repeatPeople: number;
  repeatRate: number;
  repeatRateCI: { lo: number; hi: number };
  spendPerPerson: number;
  medianSpendPerPerson: number;
  sdSpendPerPerson: number;
  spendPerVisit: number;
  itemsPerVisit: number;
  multiVenue: number;
  scanRate: number;
};

export type CoverBasis = {
  orders: number;
  ordersWithCovers: number;
  /** Share of this group's orders that record a party size. */
  coverage: number;
  covers: number;
  revenueWithCovers: number;
  spendPerCover: number | null;
  /** The two figures that prove the missingness is not at random. */
  avgOrderWithCovers: number;
  avgOrderWithoutCovers: number;
  avgCovers: number;
};

export type PairedOut = {
  n: number;
  meanBefore: number;
  meanAfter: number;
  meanDiff: number;
  lift: number;
  liftLo: number;
  liftHi: number;
  significant: boolean;
};

export type Members = {
  window: AnalysisWindow;
  crossSection: {
    member: ValueSide;
    nonMember: ValueSide;
    lifts: {
      visits: number;
      repeatRate: number;
      spendPerPerson: number;
      spendPerVisit: number;
      itemsPerVisit: number;
    };
  };
  coverBasis: { member: CoverBasis; nonMember: CoverBasis };
  standardisedBasket: {
    a: number;
    b: number;
    lift: number;
    dropped: string[];
    coverage: number;
    crude: { a: number; b: number; lift: number };
  };
  detection: {
    scanPerVisit: number;
    observedTotal: number;
    estimatedTotal: number;
    observedRepeatRate: number;
    correctedRepeatRate: number;
    inflation: number;
    correctedRepeatLift: number;
    nonMemberRepeatRate: number;
    byVisits: { visits: number; observed: number; estimated: number; detectionProb: number }[];
  };
  enrolment:
    | { estimable: true; refusal: null; visits: PairedOut; spend: PairedOut }
    | { estimable: false; refusal: string; visits: null; spend: null };
  linkage: {
    cards: number;
    cardsLinkedToMember: number;
    cardsSometimesScanned: number;
    unscannedOrders: number;
    unscannedRevenue: number;
    scannedOrders: number;
    cardsOnMultipleMembers: number;
  };
  opportunity: {
    candidates: {
      people: number;
      spend: number;
      byBand: { isMember: boolean; visitBand: number; people: number; visits: number; spend: number; avgSpend: number; orders: number }[];
    };
    uplift: {
      basis: "within-person";
      lift: number;
      lo: number;
      hi: number;
      value: number;
      valueLo: number;
      valueHi: number;
    } | null;
    unscanned: { orders: number; revenue: number; share: number };
  };
};

// ── trade density ───────────────────────────────────────────────────────────

export type DaypartRow = {
  key: string;
  label: string;
  from: number;
  to: number;
  orders: number;
  revenue: number;
  items: number;
  memberOrders: number;
  memberRevenue: number;
  cardOrders: number;
  cardRevenue: number;
  unattributedOrders: number;
  weekendShare: number;
  memberShare: number;
  avgOrderMember: number;
  avgOrderCard: number;
  avgItemsMember: number;
  avgItemsCard: number;
  spendPerCoverMember: number | null;
  spendPerCoverCard: number | null;
};

export type Dayparts = {
  window: AnalysisWindow;
  periods: DaypartRow[];
  weekendBaseline: number;
};

// ── the venue network ───────────────────────────────────────────────────────

export type NetworkNode = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  stateCode: string;
  timezone: string;
  orders: number;
  revenue: number;
  memberRevenue: number;
  memberShare: number;
  people: number;
};

export type NetworkEdge = {
  a: string;
  b: string;
  shared: number;
  /** Shared guests if visiting either venue were independent of the other. */
  expected: number;
  /** Observed over expected. Normalised for venue size, so it is not a size proxy. */
  lift: number;
  km: number | null;
  /** Lift the fitted distance-decay curve predicts at this distance. */
  predicted: number | null;
  /** Observed lift over predicted. Null where the curve is extrapolating. */
  residual: number | null;
  extrapolated: boolean;
};

export type Network = {
  window: AnalysisWindow;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  minShared: number;
  pairsTested: number;
  pairsSuppressed: number;
  ungeocoded: string[];
  decay: {
    slope: number;
    intercept: number;
    r2: number;
    n: number;
    refusal: string | null;
    supportFloorKm: number;
    extrapolatedPairs: number;
  };
  crossVenue: {
    byBand: { venueBand: number; isMember: boolean; people: number; visits: number; spend: number; avgVisits: number; avgSpend: number }[];
    single: { people: number; spend: number; visits: number; spendPerPerson: number; visitsPerPerson: number };
    multi: { people: number; spend: number; visits: number; spendPerPerson: number; visitsPerPerson: number };
    multiShareOfPeople: number;
    multiShareOfSpend: number;
    spendLift: number;
    visitLift: number;
  };
};

export type VenueMonth = {
  month: string;
  storeId: string;
  storeName: string;
  orders: number;
  revenue: number;
  memberOrders: number;
  memberRevenue: number;
  cardOrders: number;
  scannedOrders: number;
  ordersWithCovers: number;
  tradingDays: number;
  discount: number;
};

/**
 * Items, categories and the basket.
 *
 * Products and categories are dictionaries; guest rows carry integer indexes
 * into them. `integrity` is the three traps measured at extract time so the
 * checks have something to assert against.
 */
export type Items = {
  window: AnalysisWindow;
  products: {
    name: string;
    categoryId: string | null;
    category: string | null;
    type: string | null;
    lines: number;
    revenue: number;
  }[];
  categories: { id: string; name: string; type: string | null }[];
  categoryMix: {
    categoryId: string;
    category: string;
    type: string | null;
    member: { lines: number; revenue: number; people: number };
    nonMember: { lines: number; revenue: number; people: number };
    memberShare: number;
    nonMemberShare: number;
    /** Member share over non-member share. Null below the evidence floor. */
    index: number | null;
    lines: number;
  }[];
  totals: { memberProductLines: number; nonMemberProductLines: number; minLinesForIndex: number };
  integrity: {
    /** Orders carrying at least one paid line. The figure the mix depends on. */
    ordersWithItems: number;
    orders: number;
    allLines: number;
    completedLines: number;
    paidLines: number;
    productLines: number;
    modifierLines: number;
    maxQuantityAnywhere: number;
    maxQuantityOnPaid: number;
    categoryIds: number;
    categoryNames: number;
    categoryIdsRenamed: number;
    paidRevenue: number;
    orderRevenue: number;
  };
};

// ── §6.2: the heatmap, and §7.3's day grid ──────────────────────────────────

/**
 * One cell of the trading week. Day of week × daypart, both venue-local.
 *
 * `dow` is 0 for Sunday through 6 for Saturday, as the warehouse emits it. The
 * surface rotates to a Monday-first week; the snapshot does not, because a
 * rotation is a presentation choice and this is the measurement.
 */
export type DayGridCell = {
  dow: number;
  daypart: string;
  orders: number;
  revenue: number;
  memberOrders: number;
  memberRevenue: number;
  tradingDays: number;
};

export type DayGrid = {
  window: AnalysisWindow;
  cells: DayGridCell[];
  /** Named so the surface can state that both axes are local rather than imply it. */
  localised: true;
};

// ── §6.4: cross-venue, the three views ──────────────────────────────────────

/**
 * Per venue, the share of its own guests who also use another venue.
 *
 * A share, never a count. Raw counts rank by venue size, so the biggest venues
 * top every list for being big and a manager reads their own headcount rather
 * than their own position.
 */
export type VenueCrossRow = {
  storeId: string;
  storeName: string;
  /** Everybody countable seen at this venue, not only those who call it home. */
  guests: number;
  crossingGuests: number;
  share: number;
};

// ── §5.4: the scatter ───────────────────────────────────────────────────────

/**
 * Every classifiable person as three numbers, columnar.
 *
 * The guest grid ships a bounded working set, which is right for a paginated grid
 * and wrong for a scatter: §5.4's argument is that the plot draws on the whole
 * classifiable population rather than on a sample, and plotting the working set
 * would quietly restate the defect it exists to fix.
 *
 * Carries no person id, so there is nothing here to join back to a human.
 */
export type Scatter = {
  population: number;
  /** Segment vocabulary; rows carry an index into it, or −1 for the card tier. */
  segments: string[];
  /** `[spend, visits, segmentIndex]`. */
  rows: [number, number, number][];
};

// ── §6.5: the member cohort lens ────────────────────────────────────────────

/**
 * A cohort is the calendar month a member is first seen scanning.
 *
 * `observableMonths` is how far the window has actually followed this cohort. It
 * is the censor boundary as data rather than as a caption — §6.5 rule 2 — so the
 * surface draws the line instead of describing it.
 */
export type CohortRow = {
  cohort: string;
  members: number;
  avgTenureDays: number;
  medianTenureDays: number;
  avgVisits: number;
  spend: number;
  /** Seen within the canonical lapse threshold of the window close. */
  stillActive: number;
  observableMonths: number;
};

export type TriangleCell = { cohort: string; monthsSince: number; active: number; spend: number };

/** Pooled survival, over cohorts the window has actually followed that far. */
export type SurvivalPoint = {
  monthsSince: number;
  cohortsObserved: number;
  members: number;
  active: number;
  s: number;
};

/**
 * The member window, graded. §10 reproduced, carried into the snapshot so the
 * surface states the grading rather than asserting the window.
 */
export type MemberGrading = {
  from: string;
  to: string;
  days: number;
  monthsTested: number;
  monthsUsable: number;
  maxTokenShareLo: number;
  maxTokenShareHi: number;
  /** §4.3, keyed on the tier. 638 days against 89 renders; 92 days does not. */
  renders: boolean;
  thresholdDays: number;
  requiredDays: number;
  reproducedAt: string;
};

export type Cohorts = {
  window: AnalysisWindow;
  cohorts: CohortRow[];
  triangle: TriangleCell[];
  survival: SurvivalPoint[];
  gapHistogram: { days: number; n: number }[];
  gapCapDays: number;
  /** Monthly member coverage. The confound §6.5 rule 3 refuses to publish without. */
  coverage: { month: string; orders: number; withMember: number; distinctMembers: number; coverage: number }[];
  grading: MemberGrading;
};

export type Snapshot = {
  org: Org;
  coverage: Coverage;
  lifecycle: LifecycleRow[];
  decomposition: DecompositionRow[];
  segments: Segments;
  members: Members;
  dayparts: Dayparts;
  dayGrid: DayGrid | null;
  venueCross: VenueCrossRow[];
  scatter: Scatter | null;
  network: Network;
  venueMonthly: VenueMonth[];
  items: Items | null;
  /** Member tier, 21 months. Loaded per org, not per card period — see §4.3. */
  cohorts: Cohorts | null;
};
