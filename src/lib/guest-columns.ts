/**
 * The guest working set, encoded columnar.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 *
 * The grid works on a bounded working set — 17,024 rows at Coffee Guru — and
 * that whole set crosses the wire to the browser, because filtering and sorting
 * happen client-side so the grid stays instant with no request-time warehouse
 * call. As an array of objects it was **6.4MB before item data was added, of
 * which 4.3MB was the twenty-five field names repeated on every row**. Adding
 * baskets took it to 7.9MB.
 *
 * A field name repeated seventeen thousand times carries no information. Hoist
 * it once and the same data is roughly a third of the size, which is what makes
 * per-guest baskets affordable rather than a regression.
 *
 * The encoding is deliberately dumb — a field list and an array of value
 * arrays — because the alternative is a schema that has to be kept in step with
 * the extract by hand, and the extract writing a shape the app cannot read is a
 * worse failure than a large file.
 */
import type { Guest } from "./types";

/** The wire format. `fields` is the key order; each row is values in that order. */
export type PackedGuests = {
  sampled: number;
  population: number;
  fields: string[];
  rows: unknown[][];
};

export function packGuests(rows: Record<string, unknown>[]): { fields: string[]; rows: unknown[][] } {
  if (!rows.length) return { fields: [], rows: [] };
  // Field order is taken from the first row and every row is emitted in that
  // order, so a row that happens to be missing a key writes an explicit
  // undefined rather than silently shifting every value after it into the wrong
  // column. That failure would be invisible and catastrophic.
  const fields = Object.keys(rows[0]);
  return {
    fields,
    rows: rows.map((r) => fields.map((f) => r[f] ?? null)),
  };
}

export function unpackGuests(packed: PackedGuests): Guest[] {
  const { fields, rows } = packed;
  return rows.map((values) => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i++) out[fields[i]] = values[i];
    return out as unknown as Guest;
  });
}
