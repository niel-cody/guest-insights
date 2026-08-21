/**
 * Regenerate the window offer list from the grading already on disk.
 *
 *   npm run periods
 *
 * ── Why this exists separately from the extract ────────────────────────────
 *
 * `npm run extract` writes `candidates` as a matter of course, and it is the
 * only thing that can *build* a window — that needs the warehouse. But the
 * **offer list** needs no warehouse at all: which windows are answerable is
 * decided entirely by the per-month card grading, and that is already recorded
 * in `periods.json` as the runs that passed and the gaps that did not.
 *
 * So the list of what an operator may ask for can be refreshed on a laptop with
 * no credentials, which matters for two reasons. It makes the control's second
 * half — the windows that failed, and why — correct immediately rather than
 * after a two-hour extract. And it keeps the derivation honest: this script and
 * the extract call the **same** `candidateWindows`, so the two cannot drift
 * into offering different things.
 *
 * Nothing here invents data. `periods` is untouched — a window is only routable
 * once a snapshot exists for it, and only the extract can make one.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { candidateWindows, type MonthRow, type GradeReason } from "./grade";

const DATA = join(import.meta.dirname, "..", "data");

const step = (m: string, n: number) => {
  const d = new Date(`${m}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * The graded month set, reconstructed from what `periods.json` records.
 *
 * The file holds the runs that passed, the gaps that failed with their reasons,
 * and how many complete months were tested. Between them that pins every month
 * in the tested range to a verdict — the numeric detail behind each verdict
 * (transaction counts, token shares) is gone, and `candidateWindows` reads none
 * of it. **It reads `ok` and `reason`, and both survive the round trip.**
 */
function gradedMonths(file: Periods): MonthRow[] {
  const newest = file.periods
    .map((p) => p.end)
    .sort()
    .at(-1)!
    .slice(0, 7) + "-01";
  // Gaps can run past the newest usable month, so the tested range ends at
  // whichever is later — otherwise a trailing failed month vanishes from the
  // offer list instead of being offered with its reason.
  const lastGap = file.gaps.map((g) => g.end).sort().at(-1);
  const last = lastGap && lastGap > newest ? lastGap : newest;

  const failing = new Map<string, string>();
  for (const g of file.gaps) {
    for (let m = g.start; m <= g.end; m = step(m, 1)) failing.set(m, g.reason);
  }

  const months: MonthRow[] = [];
  for (let i = file.monthsTested - 1; i >= 0; i--) {
    const month = step(last, -i);
    const reason = failing.get(month) ?? null;
    months.push({
      month,
      // Zeroes rather than invented figures. Nothing downstream reads them, and
      // a plausible-looking number here would be a fabrication in a file that
      // exists to say what is and is not true.
      txns: 0, orders: 0, scannedOrders: 0, stores: 0, distinctPar: 0, withPar: 0,
      ratio: 0, coverage: 0, maxTokenShare: 0,
      ok: reason === null,
      reason: reason as GradeReason | null,
    });
  }
  return months;
}

type Periods = {
  slug: string;
  periods: { id: string; start: string; end: string; months: number }[];
  gaps: { start: string; end: string; months: number; reason: string }[];
  monthsTested: number;
  monthsUsable: number;
  candidates?: unknown[];
};

function main() {
  let total = 0;
  for (const entry of readdirSync(DATA, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(DATA, entry.name, "periods.json");
    if (!existsSync(path)) continue;

    const file = JSON.parse(readFileSync(path, "utf8")) as Periods;
    const cohortsPath = join(DATA, entry.name, "cohorts.json");
    const memberSpan = existsSync(cohortsPath)
      ? (JSON.parse(readFileSync(cohortsPath, "utf8")) as { window: { start: string; end: string } })
          .window
      : null;

    const months = gradedMonths(file);
    const candidates = candidateWindows(months, memberSpan);
    const extracted = new Set(file.periods.map((p) => p.id));

    writeFileSync(path, JSON.stringify({ ...file, candidates }));

    const buildable = candidates.filter((c) => c.gradable);
    const pending = buildable.filter((c) => !extracted.has(c.id));
    console.log(
      `\n${entry.name}\n` +
        `  ${months.length} months graded, ${months.filter((m) => m.ok).length} usable\n` +
        `  ${candidates.length} windows offered · ${buildable.length} answerable · ` +
        `${extracted.size} extracted · ${pending.length} awaiting an extract`,
    );
    for (const g of ["run", "rolling", "month", "member"] as const) {
      const rows = candidates.filter((c) => c.group === g);
      if (!rows.length) continue;
      console.log(
        `    ${g.padEnd(8)} ${rows.filter((c) => c.gradable).length}/${rows.length} answerable`,
      );
    }
    total += candidates.length;
  }
  console.log(`\n${total} windows offered across every organisation on disk.`);
}

main();
