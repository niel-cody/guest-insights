/** Shapes of the extracted snapshot. Mirrors what scripts/extract writes. */

export type Tier = "member" | "card" | "unattributed";
export type Segment = "regular" | "established" | "slipping" | "lapsed" | "one-visit";

export type Venue = {
  id: string;
  name: string;
  venueName: string;
  orders: number;
  firstDay: string | null;
  lastDay: string | null;
};

export type ParMonth = {
  month: string;
  txns: number;
  distinctPar: number;
  withPar: number;
  ratio: number;
  ok: boolean;
  reason: string | null;
};

export type Org = {
  slug: string;
  id: string;
  name: string;
  vertical: "cafe" | "restaurant";
  serviceModel: "counter" | "table";
  labels: { visit: string; visits: string; guest: string; guests: string };
  window: { start: string; end: string };
  extractedAt: string;
  venues: Venue[];
  calibration: {
    n: number;
    medianGapDays: number;
    p75: number;
    p90: number;
    p95: number;
    meanGapDays: number;
    slippingDays: number;
    lapsedDays: number;
    canonicalLapsedDays: number;
  };
  storeMap: { terminals: number; venuesResolved: number };
  cardTier: { months: string[]; quality: ParMonth[] };
};

export type CoverageTotals = {
  orders: number;
  revenue: number;
  memberOrders: number;
  memberRevenue: number;
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
    cardRevenue: number;
    memberOrders: number;
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
  segment: Segment;
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
  segment: Segment;
  valueBand: number;
  visits: number;
  venues: number;
  spend: number;
  orders: number;
  items: number;
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

export type ComparisonRow = {
  tier: "member" | "card";
  channel: string;
  orderType: string;
  orders: number;
  revenue: number;
  avgOrder: number;
  avgItems: number;
  avgCovers: number | null;
  ordersWithCovers: number;
  spendPerCover: number | null;
};

export type Linkage = {
  cards: number;
  cardsLinkedToMember: number;
  cardsSometimesScanned: number;
  unscannedOrdersOfKnownMembers: number;
  cardsOnMultipleMembers: number;
};

export type VenueMonth = {
  month: string;
  storeId: string;
  storeName: string;
  orders: number;
  revenue: number;
  memberOrders: number;
  cardOrders: number;
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
  comparison: ComparisonRow[];
  linkage: Linkage;
  venueMonthly: VenueMonth[];
};
