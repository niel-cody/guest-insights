import type { Guest } from "./types";
import type { View } from "./url-state";

/**
 * The saved-list store. **Extracted from `SaveToList` because it now has two
 * readers**, and a store that lives inside one of its consumers is a store the
 * other consumer has to import a whole component to reach.
 *
 * The writer is still §7.4's `SaveToList` on the Individuals grid. The second
 * reader is Home, which shows what the operator saved without being able to
 * create, evaluate or open one — see `SavedLists` for why it deliberately shows
 * the rule and not a count.
 *
 * Nothing here touches the network. The lists are the operator's own, they never
 * leave the browser, and this build has no account to attach them to.
 */
export type SavedList = {
  id: string;
  name: string;
  /**
   * The rule. Evaluated on read — never a frozen set of ids.
   *
   * A frozen list is a photograph that starts lying the next morning: guests
   * slip, lapse and return, and "Slipping regulars at Belconnen" from three
   * weeks ago is a list of people some of whom are no longer either.
   */
  rule: Partial<View>;
  /**
   * The scope the rule was written in. Without it "Regulars" is meaningless —
   * regular where, over what, measured how — and two people comparing lists of
   * the same name would be comparing different populations.
   */
  scope: {
    org: string;
    period: string;
    windowStart: string;
    windowEnd: string;
    venues: string[];
    tier: "member" | "card";
  };
  createdAt: string;
};

const KEY = "guests.lists.v1";

/**
 * ── Why this is a subscribable store and not a `useEffect` read ────────────
 *
 * `localStorage` is unreadable on the server, so a component that wants it has
 * to get it after hydration. The obvious way is `useEffect(() => setLists(…))`,
 * which is what the writer did while it was the only reader, and it has two
 * costs that only became visible once Home started reading the same key:
 *
 *   **It cannot tell "not read yet" from "none saved".** Both are an empty
 *   array, so a reader with four saved lists is shown "you have not saved a
 *   list yet" for one frame on every single load. A lie that is brief is still
 *   the first thing they see. `PENDING` below is a distinct identity precisely
 *   so a consumer can render nothing rather than render something false.
 *
 *   **It does not notice writes.** Save a list on Individuals and Home would
 *   keep showing yesterday's set until it happened to remount.
 *
 * `useSyncExternalStore` is the API for exactly this shape, and it wants a
 * snapshot with a **stable identity** — returning a freshly-parsed array on
 * every call spins React forever. Hence the cache, invalidated by the writer
 * and by the `storage` event that fires when another tab writes the key.
 */

/**
 * The server and first-hydration snapshot. A distinct frozen identity, never
 * returned by a real read — so `snapshot === PENDING` means "the browser has
 * not been asked yet", which is a different fact from "there are none".
 */
export const PENDING: readonly SavedList[] = Object.freeze([]);

let cache: SavedList[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedList[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as SavedList[]) : [];
  } catch {
    return [];
  }
}

function invalidate() {
  cache = null;
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  if (e.key === KEY || e.key === null) invalidate();
}

export function subscribeLists(onChange: () => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** The client snapshot. Stable between writes, which is what React requires. */
export function listsSnapshot(): readonly SavedList[] {
  if (cache === null) cache = read();
  return cache;
}

export const listsServerSnapshot = (): readonly SavedList[] => PENDING;

/** Returns `[]` on the server and on any malformed store, never throws. */
export function loadLists(): SavedList[] {
  if (typeof window === "undefined") return [];
  return [...listsSnapshot()];
}

/** The one writer. Invalidates the cache so every reader re-reads. */
export function saveLists(lists: SavedList[]) {
  window.localStorage.setItem(KEY, JSON.stringify(lists));
  invalidate();
}

/**
 * The tier a population actually resolves to, or null when it spans both.
 *
 * Derived from the rows rather than from the filter, because a rule with no
 * explicit tier can still select one — "seen once at Belconnen" is card-tier in
 * practice — and storing the tier that was *asked for* rather than the one that
 * came back is how a list ends up mislabelled.
 */
export function resolvedTier(rows: Guest[]): "member" | "card" | null {
  if (!rows.length) return null;
  const first = rows[0].tier;
  return rows.every((r) => r.tier === first) ? first : null;
}
