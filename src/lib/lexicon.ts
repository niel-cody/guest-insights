/**
 * The vocabulary, declared once. **BH-1 of the Build 5 review.**
 *
 * ── The collision this closes ──────────────────────────────────────────────
 *
 * "Card" meant **payment card** everywhere in this build. A loyalty member also
 * carries a card. So "card guest" read as "loyalty card guest" to exactly the
 * audience the product is for, and "known versus unknown members" was the
 * confusion that came back from demos — the only item on the Build 5 board
 * sourced from real people rather than from the team or the council.
 *
 * It is a vocabulary problem, which is the kind that gets more expensive every
 * build: the words are on the nav, both header chips, the Customers filter, the
 * tier control, four KPI cards, the segment definitions and the guest grid's
 * Tier column. So they are declared here and read from here, and a rename is
 * one edit rather than a search across nine surfaces that misses two.
 *
 * ── What changed, and what deliberately did not ────────────────────────────
 *
 * | Concept                                    | Was         | Is now             |
 * |--------------------------------------------|-------------|--------------------|
 * | Anyone the product can recognise again      | Known guest | **Guest**          |
 * | Recognised by payment card, never enrolled  | Card        | **Recognised**     |
 * | Enrolled in the loyalty programme           | Member      | **Member**         |
 * | Identity by payment instrument              | Card tier   | **Payment identity** |
 * | Identity by loyalty scan                    | Member tier | **Loyalty identity** |
 *
 * **The internal keys do not change.** `tier === "card"` stays `"card"` in the
 * URL contract, in the extract, in every snapshot on disk and in every type in
 * `lib/types.ts`. This module renames what a reader sees, not what the data
 * calls itself — a data migration to fix a labelling problem would invalidate
 * every saved link and every snapshot in `data/`, for no gain a reader could
 * see. The one place the two meet is here.
 *
 * **"Member" is unchanged**, because it was never the ambiguous half. The
 * confusion was always about what the *other* group is called.
 */

/** Internal tier keys. Unchanged, and not renamed by this module. */
export type TierKey = "member" | "card" | "all";

/**
 * What each tier is called on screen.
 *
 * `card` is **"Recognised"** and not "Seen": "Seen once" is already a lifecycle
 * segment in this build, and a tier called "Seen" sitting above a segment
 * called "Seen once" would collide on the one screen where both appear.
 */
export const TIER_LABEL: Record<TierKey, string> = {
  member: "Members",
  card: "Recognised",
  all: "All guests",
};

/** Singular, for a row or a single person. */
export const TIER_NOUN: Record<TierKey, string> = {
  member: "member",
  card: "recognised guest",
  all: "guest",
};

/**
 * The identity method, which is a different thing from the population.
 *
 * "Card tier" conflated the two: it named both *the people identified by
 * payment card* and *the method of identifying them*. Splitting them is most of
 * what makes the rename worth doing — a caption saying "payment identity"
 * describes a method and cannot be misread as a population, and a caption
 * saying "Recognised" describes a population and cannot be misread as a method.
 */
export const IDENTITY_LABEL: Record<"card" | "member", string> = {
  card: "Payment identity",
  member: "Loyalty identity",
};

/** Lower-case, for mid-sentence use. */
export const IDENTITY_NOUN: Record<"card" | "member", string> = {
  card: "payment identity",
  member: "loyalty identity",
};

/**
 * The umbrella term for anybody the product can recognise again, by either
 * method. Used where the old build said "known guest" or "people you can name".
 */
export const GUEST_UMBRELLA = "Guest";

/**
 * One sentence a reader can be given anywhere the distinction first bites.
 *
 * Written once because it is the answer to the demo question, and an answer
 * that gets re-typed per surface is an answer that drifts per surface.
 */
export const RECOGNISED_GLOSS =
  "Recognised by the payment card they used, and never enrolled in the loyalty programme. " +
  "The card here is the one they paid with, not a loyalty card.";

export const MEMBER_GLOSS =
  "Enrolled in the loyalty programme. Resolved through the payment card as well as the scan, " +
  "so a member who forgets to scan is still counted as the same person.";
