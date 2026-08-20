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
  /**
   * Transactions, against `visits` which are person-days at a venue.
   *
   * Both are needed and they are different questions: spend per visit is what a
   * guest is worth each time they walk in, average transaction value is what
   * the till sees. Two coffees an hour apart is one visit and two orders, so
   * the two figures diverge exactly where a guest buys more than once a day —
   * which is the behaviour that defines the most valuable segment here.
   *
   * Optional because snapshots extracted before these columns existed do not
   * carry them, and a surface that reads them declines to draw rather than
   * dividing by an absent denominator.
   */
  orders?: number;
  items?: number;
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

/**
 * Visit timing and basket shape by lifecycle segment, whole population.
 *
 * One row per segment, day of week and daypart. `dow` is the warehouse's
 * `DAYOFWEEK` — Sunday is 0 — and is rotated to a Monday-first week at the
 * presentation boundary, never here.
 *
 * Null on a snapshot extracted before the query existed. Every consumer guards,
 * because the alternative to guarding is a surface that silently reads zero.
 */
export type SegmentBehaviourRow = {
  segment: Segment;
  dow: number;
  daypart: string;
  visits: number;
  orders: number;
  spend: number;
  items: number;
  people: number;
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
   * Every visit as [dayOffsetFromWindowStart, orders, spend, venueIndex,
   * daypartIndex]. `visits` above is the uncapped total, and the two agree by
   * construction — see `visitHistoryQuery`.
   *
   * **The fifth element is optional because snapshots predate it.** The extract
   * has always selected the daypart and used to discard it at pack time; a
   * snapshot taken before that was fixed carries four-wide tuples. The drawer
   * reads the width rather than assuming it, so an old snapshot keeps rendering
   * the calendar-week grid instead of a daypart grid with every visit in one
   * column, which is what filling the gap from `homeDaypart` would produce.
   */
  history: ([number, number, number, number] | [number, number, number, number, number])[];
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

/**
 * Per-product, per-month lines and revenue. The price history OV-7 said the
 * extract did not carry.
 *
 * `product` indexes into `Items.products`, so this file cannot be read without
 * `items.json` and cannot disagree with it about what a product is. Rows are
 * the same population as `decomposition` — identified guests — because the split
 * they support is a split of a bar in that decomposition.
 *
 * Null on any snapshot extracted before `itemPriceMonthlyQuery` existed, which
 * is why `priceMix` returns null rather than assuming the file is there.
 */
export type ItemPrices = {
  window: AnalysisWindow;
  /** One row per product per month. `product` indexes `Items.products`. */
  rows: { month: string; product: number; lines: number; revenue: number }[];
  /**
   * What this covers of the trade it is used to explain, per month.
   *
   * A split computed on 70% of the revenue is not a split of the whole, and the
   * surface refuses below a floor rather than publishing one. Product lines are
   * a narrower universe than the order-header item count the decomposition runs
   * on, so the two never match exactly and the gap has to be visible.
   */
  coverage: {
    month: string;
    /** Product-line revenue this month, over the decomposition's revenue for it. */
    revenueShare: number;
    lines: number;
    revenue: number;
    products: number;
  }[];
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
  /** Per-product monthly prices. Null before `itemPriceMonthlyQuery` existed. */
  itemPrices: ItemPrices | null;
  /** Segment × day × daypart, whole population. Null before the query existed. */
  segmentBehaviour: SegmentBehaviourRow[] | null;
  /** Member tier, 21 months. Loaded per org, not per card period — see §4.3. */
  cohorts: Cohorts | null;
  /**
   * The team half. Null on a snapshot extracted before it existed; present but
   * `available: false` for an organisation with no workforce integration.
   */
  team: Team | null;
};

// ── the team half ───────────────────────────────────────────────────────────

/**
 * How confident the identity spine is about one POS login.
 *
 * There are five states and not two, because the difference between them is the
 * product. `confirmed` has corroborating evidence beyond a first name.
 * `proposed` is a good bet on a unique first name and is not proof. `conflict`
 * has a first name that agrees and surname evidence that does not — the pair
 * most likely to be two different people, and the first row a human should open.
 * `collision` is two logins on one employee. `not-a-person` is a shared login,
 * a device or a system account, which is a finding rather than a failure.
 */
export type TeamVerdict =
  | "confirmed" | "proposed" | "conflict" | "collision" | "unmatched" | "not-a-person";

/** One row of the mapping review queue. */
export type TeamLink = {
  posId: string;
  posLabel: string;
  empId: string | null;
  empLabel: string | null;
  verdict: TeamVerdict;
  evidence: string;
  storeId: string;
  storeName: string;
  orders: number;
  net: number;
  /** Days this login rang trade. A shared login shows up here as far too many. */
  days: number;
  /** Other POS labels the matcher put on the same employee. */
  rivals: string[];
};

/**
 * A person as the report can see them: the POS side, the workforce side, and
 * the ratio that only exists when both are present.
 *
 * Every rate is null rather than zero where its denominator is missing. A chef
 * has hours and no attributed sales, and a chef rendered at $0 per labour hour
 * is a defamation of a chef.
 */
export type TeamPerson = {
  id: string;
  label: string;
  storeId: string;
  storeName: string;
  verdict: TeamVerdict;
  /** True only where the link is good enough to divide one side by the other. */
  costed: boolean;
  employmentType: "Salaried" | "Waged" | null;
  department: string | null;
  section: string;
  // POS side. Null where this person never rang an order.
  orders: number;
  net: number;
  items: number;
  covers: number;
  ordersWithCovers: number;
  days: number;
  discount: number;
  // The decomposition. Revenue per cover = items per cover × average item value.
  itemsPerCover: number | null;
  avgItemValue: number | null;
  netPerCover: number | null;
  netPerOrder: number | null;
  coversPerOrder: number | null;
  // Workforce side. Null where this person is not linked to a costed employee.
  hours: number | null;
  cost: number | null;
  penaltyHours: number | null;
  shifts: number | null;
  // The ratio. Null unless both sides are present.
  netPerHour: number | null;
  coversPerHour: number | null;
  costPerHour: number | null;
  wagePct: number | null;
  /** Per weekday and per daypart, POS side only. `[dow, daypart, orders, net, items, covers]`. */
  grain: [number, string, number, number, number, number][];
};

/**
 * One cell of the margin grid, at whichever grain the collection names.
 *
 * `margin` is **net sales minus wage cost**, and it is not gross margin. Cost of
 * goods is recorded on 3.1% of Meat Flour Wine orders, so gross profit is not
 * computable and is refused rather than approximated — see `costCoverage`.
 */
export type TeamMarginCell = {
  key: string;
  label: string;
  storeId: string;
  net: number;
  /** Award and allowance. Leave is excluded and carried separately. */
  labour: number;
  leave: number;
  plannedLabour: number | null;
  hours: number;
  /** Award hours worked outside ordinary hours — the penalty exposure. */
  penaltyHours: number;
  penaltyCost: number;
  orders: number;
  covers: number;
  tradingDays: number;
  /**
   * The three ratios, and every one of them is nullable on purpose.
   *
   * A clock daypart carries real labour and real sales and **no valid ratio
   * between them**, because a kitchen preps at ten for a lunch that sells at
   * twelve and a floor team clears at eleven for a dinner that sold at seven.
   * Dividing the two produces Late Evening at 348% wage, which is arithmetic
   * rather than measurement. Those cells therefore ship with all three ratios
   * null and `refusal` set, so a surface cannot render one by reaching past a
   * caption. The service-block grain carries the same trade and the same labour
   * with the boundary drawn where the operator draws it, and does have them.
   */
  wagePct: number | null;
  margin: number | null;
  netPerHour: number | null;
  /** Why the ratios are absent, where they are. Null when they are present. */
  refusal: string | null;
  /**
   * The day part group this cell nests inside, on grains where it has one.
   *
   * Carried in the data rather than derived in the UI, so the nesting is stated
   * once by the thing that computed it and cannot drift from a second copy of
   * the mapping living in a component.
   */
  group?: string;
};

export type TeamMargin = {
  /** The clock. Trade shape and labour shape; ratios refused. */
  daypart: TeamMarginCell[];
  /** Day part groups. The finest grain a wage percentage survives. */
  service: TeamMarginCell[];
  /** Group × day of week — which service on which day, the rostering question. */
  serviceDow: (TeamMarginCell & { dow: number; service: string })[];
  /**
   * Every trading date × group. The instances a weekday norm is built from, and
   * the rows an exception is found in — "this Monday against a normal Monday"
   * needs both the pooled pattern and the individual days underneath it.
   */
  dayService: (TeamMarginCell & { dow: number; service: string; date: string })[];
  dow: TeamMarginCell[];
  /** Day of week × daypart. `dow` is the warehouse's Sunday-zero index. */
  dowDaypart: (TeamMarginCell & { dow: number; daypart: string })[];
  week: TeamMarginCell[];
  month: TeamMarginCell[];
  day: TeamMarginCell[];
};

/** What the workforce feed is, and what it is missing. Named so it can be fixed. */
export type TeamIntegrity = {
  vendor: string | null;
  posIdentities: number;
  employees: number;
  /** Employee ids matching a POS user id. Zero everywhere, and that is the point. */
  idMatches: number;
  exactNameMatches: number;
  counts: Record<TeamVerdict, number>;
  /** Share of trade rung by a login the spine can cost. */
  costedOrders: number;
  costedNet: number;
  /** Cost segments whose employee has no row on the current roll. Leavers. */
  orphanEmployees: number;
  orphanCost: number;
  /** Segments with no start time. They vanish from every time-bounded query. */
  nullStartSegments: number;
  nullStartCost: number;
  /** Orders carrying a cost of goods. The gate on gross margin. */
  costCoverage: number;
  /** Raw vendor departments, and what they collapse to. The multi-site problem. */
  departments: number;
  sections: number;
  /** Waged employees with no contracted weekly hours recorded. */
  wagedWithoutContractedHours: number;
  waged: number;
  salaried: number;
  /** Elapsed time against recorded hours, asserted rather than assumed. */
  elapsedAgrees: boolean;
  segments: number;
};

export type Team = {
  window: AnalysisWindow;
  /**
   * False where the organisation has no workforce integration at all.
   *
   * Coffee Guru is nineteen venues on no rostering vendor. There is no labour
   * cost, no roster and no employee roll, so every figure in this section is
   * refused for that organisation rather than rendered as zero — and the refusal
   * is the honest statement of what integrating would buy them.
   */
  available: boolean;
  refusal: string | null;
  integrity: TeamIntegrity;
  links: TeamLink[];
  people: TeamPerson[];
  margin: TeamMargin;
  /** Section totals, for the multi-site roll-up the raw names prevent. */
  sections: {
    section: string;
    departments: string[];
    storeIds: string[];
    hours: number;
    cost: number;
    penaltyCost: number;
    people: number;
  }[];
  totals: {
    net: number;
    labour: number;
    leave: number;
    plannedLabour: number;
    hours: number;
    penaltyHours: number;
    penaltyCost: number;
    wagePct: number;
    margin: number;
    netPerHour: number;
  };
};
