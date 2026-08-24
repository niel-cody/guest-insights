/**
 * The Insights information architecture, as data.
 *
 * ── Why this is not inside `Sidebar` ───────────────────────────────────────
 *
 * **The placement is the thing under review**, and it has to be assertable
 * without rendering anything. Most of these sections are collapsed by default,
 * so a collapsed group emits no markup at all — which means a test reading the
 * built HTML cannot tell "Taxes is filed under Finance" from "Taxes was
 * deleted". Every DOM assertion about a collapsed section is silently vacuous.
 *
 * As a plain module with no React in it, `scripts/layout-tests.ts` imports it
 * directly and asserts the map itself: every live report present, each one
 * where it was placed, nothing linked that has nothing behind it, and the two
 * deliberate omissions still omitted.
 */

/**
 * ═══ Insights is eight subjects, plus a landing state and a utility drawer ═══
 *
 * The nav this replaces had six groups — Sales, Payments, Operations, Team,
 * Customers, Admin — three of which were empty and none of which was derived
 * from anything. It was the shape the POC happened to grow into.
 *
 * The eight below are **subjects, and each is a question an operator actually
 * asks**. That is the whole test, and it is why the list is not the org chart
 * and not the source systems:
 *
 *   1. Sales           What did we sell?
 *   2. Menu & Product   What's selling, and what's it earning?
 *   3. Inventory        What do I hold, what did it cost, where is it leaking?
 *   4. Service          How well did we deliver it?
 *   5. Team             Who did it, and what did it cost to do?
 *   6. Guests           Who did we serve, are they coming back?
 *   7. Finance          Did the money arrive, does it reconcile?
 *   8. Exceptions       Should this have happened?
 *
 * A surface belongs to the section whose question it answers. When a surface
 * seems to fit two, it is usually answering neither well, and that is a finding
 * about the surface rather than a reason to duplicate it into both.
 *
 * ── Home and Platform are deliberately not numbered ────────────────────────
 *
 * **Home is a landing state, not a subject.** It answers "what needs me right
 * now?", which is not a question about the business — it is a question about
 * the reader. It carries whatever is live, whatever is shouting, and whatever
 * they saved. Filing it as section zero would make it compete with the eight,
 * and within a fortnight somebody would be arguing about which of its cards is
 * "really" a Sales card.
 *
 * **Platform is a drawer, not a subject.** Delivery, planning inputs and
 * governance are things you *operate*, not things you *read* — the same
 * distinction that pulled People Mapping out of Team. It sits last, apart, and
 * closed.
 *
 * ── Six of the eight are empty here, and are shown anyway ──────────────────
 *
 * Sales, Menu & Product, Inventory, Service, Finance and Exceptions have
 * nothing in this proof of concept. They render as inert headers carrying their
 * question, because **a reviewer cannot tell us whether the shape is right if
 * they can only see the two corners we happened to build.** The same argument
 * put Loyalty Spend in the nav.
 *
 * They are inert rather than clickable for the reason the rail is inert: a
 * control is wired or it is not a control.
 */
/**
 * A nav item, in one of three states. The three are genuinely different things
 * and the nav has to say which is which, because a reviewer deciding what to
 * click is also deciding what to give feedback on.
 *
 *   **Built.** `href` set, `placeholder` false. A surface this build owns and
 *   is asking you to judge.
 *
 *   **Stand-in.** `href` set, `placeholder` true. A production report with a
 *   flat, non-interactive stand-in page here, marked `existing` in the nav and
 *   labelled on its own face. Two of these: Loyalty Spend and Loyalty
 *   Redemption. Feedback on them belongs to the team that owns the live report.
 *
 *   **Listed.** No `href`. A report that ships in production today and has no
 *   surface here at all — a grey label, not a link, nothing behind it. This is
 *   the state added for the other thirty-odd live reports, and it is
 *   deliberately *less* than a stand-in: building thirty stand-in pages would
 *   be thirty screens of invented figures nobody is maintaining, which is the
 *   exact failure `Placeholder` was written to avoid. The name and its position
 *   are the whole content, and the position is the thing under review.
 */
export type Item = {
  label: string;
  /** Absent when the report ships today but has no surface in this POC. */
  href?: string;
  /** True only for the two production reports that have a stand-in page here. */
  placeholder?: boolean;
};

/**
 * §6. Guests. The section formerly called Customers.
 *
 * ── Why the rename is not cosmetic ─────────────────────────────────────────
 *
 * "Customers" names a transaction counterparty. **"Guests" names somebody you
 * are hosting**, and the difference is the argument of the section: the lever
 * is what a returning person is worth, not what a transaction was worth. It is
 * the same move that renamed Staff to Team, for the same reason, and hospitality
 * operators already use the word at the table.
 *
 * ── The item inside it had to be renamed, and this is why ──────────────────
 *
 * There was a report called Guests inside a section now also called Guests, and
 * "Guests › Guests" reads as a mistake even when it is not. It is now
 * **Individuals**, which is the more honest name regardless of the collision:
 * every other surface in this section computes over a population, and this is
 * the only one that goes down to the person. The route stays `/guests` —
 * links to it are in circulation, and a shared link that 404s is the defect
 * Phase 0 spent its time removing.
 *
 * ── Order: the four built reports run group level down to the person ───────
 *
 * Overview, Behaviour, Retention and Churn, Individuals — then the two
 * production stand-ins. They used to be interleaved, which interrupted the goal
 * path twice: a reviewer clicking down the list hit two dead ends before
 * reaching the surfaces the Overview sets up.
 *
 * Retention sits between Behaviour and Individuals on purpose. Behaviour ends on
 * *how* people trade; Individuals opens the person. Whether they came back at
 * all is the question between the two.
 *
 * Two are **stand-ins**. Loyalty Spend and Loyalty Redemption exist in
 * production and are not being built, changed or fixed. They are here so the
 * section reads correctly, and they are marked so nobody mistakes a stand-in for
 * a surface this build owns. **There is no Customer Report** — it is the thing
 * being replaced, so it does not appear.
 */
const GUESTS: readonly Item[] = [
  { label: "Overview", href: "overview" },
  { label: "Behaviour", href: "behaviour" },
  { label: "Retention and Churn", href: "retention" },
  { label: "Individuals", href: "guests" },
  { label: "Loyalty Spend", href: "loyalty-spend", placeholder: true },
  { label: "Loyalty Redemption", href: "loyalty-redemption", placeholder: true },
  /* The promotions half of today's Adjustments report. Adjustments answers two
     questions at once — "did this offer work" and "should this have happened" —
     and those are a Guests question and an Exceptions question. It is listed in
     both, which is not duplication: they are different reports that happen to
     share a source today. */
  { label: "Promotions & offers" },
  /* **Customer Report is deliberately absent.** It is the report this build
     exists to replace, so listing it here as a thing we might POC later would
     misstate what is happening to it. It is the only live report left off this
     nav, and it is left off on purpose rather than by omission. */
] as const;

/**
 * §5. Team. Two built reports, then the two that already ship.
 *
 * The group is called Team, and it used to be called Staff. "Staff" names a cost
 * line; **"Team" names the people the cost line is made of**, and the difference
 * is the whole argument of this section — the lever is raising what a committed
 * hour returns, not cutting the hour. A manager who opens a section called Staff
 * is already looking for somebody to send home.
 *
 *   **Performance** is who is doing well and *why* — the decomposition, not the
 *   ranking.
 *
 *   **Margin** is the money: what each service, day, week and month returns
 *   against what it costs.
 *
 * People Mapping led this section once, on the argument that a reviewer who
 * meets the league table before they meet the unproven matches underneath it
 * will believe the league table. The risk was real; the placement was the wrong
 * answer to it. **It is a review queue, not a report**, and a queue at the top
 * of a reporting section is a chore standing in front of everybody who came to
 * read something. It is in Platform now, and the caveat it used to carry by
 * adjacency travels instead: `SpineChip` rides in the header of both reports
 * below, says how many joins beneath those figures are unproven, and links to
 * the queue. Chrome that follows the reader is strictly stronger than
 * adjacency — adjacency only works on the reader who arrives through the nav,
 * and most arrive through a link.
 *
 * Staff Scorecard and Attendance ship in production and are **not built,
 * changed or fixed here**.
 */
const TEAM: readonly Item[] = [
  { label: "Performance", href: "team/performance" },
  { label: "Margin", href: "team/margin" },
  { label: "Staff Scorecard", href: "team/staff-scorecard", placeholder: true },
  { label: "Attendance", href: "team/attendance", placeholder: true },
  { label: "Users" },
] as const;

/**
 * Platform. Where the things you *act on* live, as opposed to the things you
 * read. Formerly Admin, and renamed because the target IA reserves Admin for the
 * product-wide rail entry — an Insights section called Admin sitting beside a
 * rail icon called Admin is two different scopes wearing one word.
 *
 * Both items are work queues rather than reports. People Mapping is the identity
 * join a manager works through; Data Health is what the till is not capturing
 * and what each gap costs an answer.
 *
 * Data Health is here rather than inside a report for the same reason People
 * Mapping is. A caveat on a figure has to travel with the figure — the coverage
 * chip, the check register, the spine chip and the labour note all do. "This
 * venue stopped recording party size in February 2025" is not a caveat on a
 * reading; it is a job for somebody who is not reading a chart at all.
 *
 * Its two engines had been built, maintained and covered by checks while
 * rendering nowhere: their only consumer was `TrustPanel`, which left Overview
 * and was never rehoused.
 */
const PLATFORM: readonly Item[] = [
  { label: "People Mapping", href: "admin/people-mapping" },
  { label: "Data Health", href: "admin/data-health" },
  /* The inbox. In Platform because it is a thing you work through rather than
     a thing you read, which is the same test that put the other two here. It
     is staff-only and 404s for a merchant grant — see the page. */
  { label: "Feedback", href: "admin/feedback" },
  /* Today's Admin section, whole. Saved and Scheduled Reports are promoted out
     of Settings, because a saved view is a first-class object and burying it in
     a settings screen is why nobody has one. */
  { label: "Saved Reports" },
  { label: "Scheduled Reports" },
  { label: "Forecasting & Planning" },
  { label: "Dates & Times" },
  { label: "Forecasting Settings" },
] as const;

/**
 * ═══ The live reports, listed where they will land ═══════════════════════
 *
 * Everything below ships in Oolio Insights **today** and has no surface in this
 * POC. Source: the 29 July 2026 teardown, which enumerated all thirty-six
 * routes from the live navigation DOM rather than from memory, and the v2
 * reporting architecture, which is where the placement comes from.
 *
 * They are here because **the placement is the thing under review**, and it
 * cannot be reviewed against six empty headers. Today's six sections — Sales,
 * Payments, Operations, Staff, Customers, Admin — split fourteen reports into
 * one bucket and three into another, which is why "where would I find hourly
 * trade" has no good answer. Seeing where each one lands under the eight is how
 * you tell whether the eight are right.
 *
 * **Two of today's thirty-six are not listed, and both are deliberate.**
 *
 *   *Devices* is not a report under this model. It is the order fact with the
 *   row set to a till, which makes it a Group and a Filter — the same test that
 *   collapsed Stores Overview and Hourly Sales into Sales. Giving it a nav item
 *   would re-import the thing the eight subjects exist to remove.
 *
 *   *Customer Report* is the report this build replaces. Listing it as
 *   something we might POC later would misstate what is happening to it. See
 *   `GUESTS`.
 *
 * One report is listed **twice**, in Guests and in Exceptions. Adjustments
 * answers two different questions off one source, and splitting it is the
 * placement decision, not an accident of the list.
 */

/** §1. Fourteen of today's reports lived under Sales. Seven of them are Sales. */
const SALES: readonly Item[] = [
  { label: "Trading Monitor" },
  { label: "Sales Summary" },
  { label: "Revenue Performance" },
  { label: "Sales Trends" },
  { label: "Stores Overview" },
  { label: "Hourly Sales" },
  { label: "Sales Feed" },
] as const;

/**
 * §2. The other four Sales reports, which are not Sales.
 *
 * Products, Option Groups, Categories and Reporting Group are the same order
 * fact with the row set to a product, an option, a category and a group. Under
 * Rule 1 that makes all four a Group control on one page — but they are listed
 * separately here because **this nav is a map of today, not of the target**,
 * and collapsing them in the sidebar would hide the consolidation rather than
 * show it. The four reports are real and shipped; whether they survive as four
 * is the argument this section exists to have.
 */
const MENU_PRODUCT: readonly Item[] = [
  { label: "Products" },
  { label: "Categories" },
  { label: "Reporting Group" },
  { label: "Option Groups" },
] as const;

/**
 * §4. Two reports, and they were filed under Operations beside reconciliation.
 *
 * A kitchen bump time and a bank settlement are not the same subject. That they
 * shared a section is the clearest single argument for the split.
 */
const SERVICE: readonly Item[] = [
  { label: "KDS Metric" },
  { label: "Tables & Sections" },
] as const;

/**
 * §7. Today's whole Payments section, plus the two Operations reports that were
 * always about money, plus Taxes.
 *
 * Taxes sat under Sales. It is a ledger question — what is owed and to whom —
 * and it moved here on the fact, not on the menu it happened to be under.
 */
const FINANCE: readonly Item[] = [
  { label: "Payments" },
  { label: "Settlements" },
  { label: "Transactions" },
  { label: "Terminal Summary" },
  { label: "Transfers" },
  { label: "Reconciliation" },
  { label: "Shift Summaries" },
  { label: "Taxes" },
] as const;

/**
 * §8. Voids and Refunds left Operations, and the comps half of Adjustments
 * joins them.
 *
 * The teardown found `Staff Complimentary -$1,834.50` and `Complimentary
 * -$9,991.50` in thirty days at a two-venue operator, visible in exactly one
 * report that was filed under Sales. Material comped value with no home is what
 * this section is for.
 */
const EXCEPTIONS: readonly Item[] = [
  { label: "Voids" },
  { label: "Refunds" },
  { label: "Comps & adjustments" },
] as const;

/**
 * The eight subjects in order, each carrying the question it answers.
 *
 * The question is not decoration. It is on the header as a tooltip on every
 * group and rendered in full under the six empty ones, because **an empty
 * section that does not say what it is for is indistinguishable from a section
 * nobody has thought about** — and a reviewer being asked whether the shape is
 * right needs to be able to tell those two apart.
 */
export type Section = {
  label: string;
  question: string;
  /**
   * Whether the group starts expanded. **Nothing does.**
   *
   * Team and Guests used to, on the argument that they hold the surfaces this
   * build is asking you to judge. With thirty-five live reports now listed
   * beside them, two open groups among nine closed ones read as an inconsistent
   * nav rather than as emphasis — and the nine section headers, seen together,
   * are the thing actually under review. The field is kept because a future
   * section may earn it; none does today.
   */
  open?: boolean;
  items: readonly Item[];
};

export const SECTIONS: Section[] = [
  { label: "Sales", question: "What did we sell?", items: SALES },
  { label: "Menu & Product", question: "What's selling, and what's it earning?", items: MENU_PRODUCT },
  /* The only subject with nothing at all. Oolio ships no stock reporting today,
     which is the finding, not a gap in this list. */
  { label: "Inventory", question: "What do I hold, what did it cost, where is it leaking?", items: [] },
  { label: "Service", question: "How well did we deliver it?", items: SERVICE },
  { label: "Team", question: "Who did it, and what did it cost to do?", items: TEAM },
  { label: "Guests", question: "Who did we serve, are they coming back?", items: GUESTS },
  { label: "Finance", question: "Did the money arrive, does it reconcile?", items: FINANCE },
  { label: "Exceptions", question: "Should this have happened?", items: EXCEPTIONS },
];

/** Not a subject: a drawer, sitting after the eight and closed. */
export const UTILITY: Section = {
  label: "Platform",
  question: "Delivery, planning inputs, governance.",
  items: PLATFORM,
};

/**
 * The key a surface is stored under on the board.
 *
 * Built surfaces key off their route, which is already unique and already the
 * thing a link points at. Listed reports have no route, so they key off a slug
 * of their label — and the slug is derived rather than hand-written because a
 * second hand-maintained list of thirty-five identifiers is a second list to
 * get out of step with the first.
 *
 * The consequence to know about: **renaming a listed report loses its status.**
 * That is the right trade at this size. The alternative is a permanent opaque
 * id on every row, which is the correct answer for a product and overkill for a
 * nav whose whole purpose is to be argued about and rearranged.
 */
export function surfaceKey(item: Item): string {
  return item.href ?? item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Every surface in the nav, in order, for the board and its tests. */
export function allSurfaces(): { key: string; label: string; section: string; item: Item }[] {
  return [...SECTIONS, UTILITY].flatMap((g) =>
    g.items.map((item) => ({ key: surfaceKey(item), label: item.label, section: g.label, item })),
  );
}
