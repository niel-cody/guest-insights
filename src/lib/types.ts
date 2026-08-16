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

export type ParMonth = {
  month: string;
  txns: number;
  orders: number;
  distinctPar: number;
  withPar: number;
  ratio: number;
  maxTokenShare: number;
  ok: boolean;
  reason: string | null;
};

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
  cardTier: { months: string[]; allUsableMonths: string[]; quality: ParMonth[] };
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
  name: string;
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
};

export type Guests = { sampled: number; population: number; rows: Guest[] };

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

export type Snapshot = {
  org: Org;
  coverage: Coverage;
  lifecycle: LifecycleRow[];
  decomposition: DecompositionRow[];
  segments: Segments;
  members: Members;
  dayparts: Dayparts;
  venueMonthly: VenueMonth[];
};
