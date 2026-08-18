import { InfoButton } from "@/components/ui/InfoButton";
import { count, delta, money, pct, ratio } from "@/lib/metrics";
import type { ValueClaim } from "@/lib/metrics";

/**
 * §5.5. "Are your members worth more?" — six ways, sharing one reference line.
 *
 * ── Why six panels and not one number ─────────────────────────────────────
 *
 * They disagree, and **the disagreement is the finding**. Spend per visit says
 * members are worth 7% less. Value per person says 4.9×. Both are correct
 * measurements of different quantities, and a report that publishes either alone
 * is not wrong so much as unfalsifiable — which is how the category ends up with
 * a loyalty programme nobody can defend or cancel.
 *
 * ── The scale ──────────────────────────────────────────────────────────────
 *
 * §8 rule 1: shared scale on any grid of panels, because independent scales make
 * a weak panel look like the strongest one. The complication is range — these
 * run from 0.93× to 5.3×, and on a shared *linear* axis the −7% is a hairline
 * beside the 5.3× and reads as nothing at all.
 *
 * So the shared axis is **logarithmic in the ratio, centred on 1.0×**. Equal
 * visual distance means equal proportional change in either direction, which is
 * the property that makes "7% worse" and "5.3 times better" comparable marks on
 * one ruler. The axis says so on its face.
 *
 * ── The refusal ────────────────────────────────────────────────────────────
 *
 * Spend per cover is not published, and it renders as a **struck-through panel
 * with the reason underneath** rather than as a blank (§8 rule 3). A blank reads
 * as broken; a strike reads as a decision. Party size is recorded on 20% of
 * member orders and 29% of everybody else's, and not at random — the member
 * orders that do record it run much larger than those that do not — so
 * restricting to them keeps the top of one distribution and nearly all of the
 * other.
 */

const AXIS_MIN = 0.5;
const AXIS_MAX = 6;
const lg = (r: number) => Math.log(Math.max(r, 0.01));
const SPAN = lg(AXIS_MAX) - lg(AXIS_MIN);

/** Where a ratio sits on the shared axis, as a fraction of the panel width. */
const position = (r: number) => Math.max(0, Math.min(1, (lg(r) - lg(AXIS_MIN)) / SPAN));

const ONE = position(1);

function fmt(v: number | null, unit: ValueClaim["unit"]): string {
  if (v === null) return "—";
  if (unit === "money") return money(v);
  if (unit === "rate") return pct(v, 0);
  return v.toFixed(2);
}

export function ValuePanels({ claims }: { claims: ValueClaim[] }) {
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {claims.map((c) => <Panel key={c.key} claim={c} />)}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[11px] text-ink-muted">
        <span>
          All six panels share one scale, anchored at <strong className="text-ink-secondary">1.0×</strong> —
          the dashed line. It is logarithmic, so equal distance is equal proportional change in either
          direction.
        </span>
        <span className="tnum">0.5× · 1.0× · 2× · 4× · 6×</span>
      </div>
    </div>
  );
}

function Panel({ claim }: { claim: ValueClaim }) {
  const refused = claim.refusal !== null;
  // A ratio of 1 + lift: `lift` is signed against the non-member baseline, so
  // −7% is 0.93× and 4.9× is 5.94 on this axis. One conversion, here, rather
  // than each panel deciding what its own number means.
  const r = claim.lift === null ? null : 1 + claim.lift;
  const up = (claim.lift ?? 0) >= 0;

  return (
    <div className="bg-surface-raised px-4 py-3.5">
      {/* ── The method, behind a button (C-3) ─────────────────────────────
          `note` carries how a panel's figure is constructed and **was rendered
          nowhere**. On most panels that was a small loss. On the repeat-rate
          panel it was a real defect: that figure is corrected, the correction
          moves it five points against the uncorrected rate the segment table on
          the same page implies, and the reader was given no way to find out why
          the two disagree.

          It is a button and not open prose because it is method — read once,
          then never again — and six panels each carrying three lines of it is
          the wall this block was trimmed to stop being. What went on the face
          instead is the pair of figures and the direction, in `basis`, because
          those are part of the figure. */}
      <h3 className={`flex items-start gap-1.5 text-[13px] font-semibold ${refused ? "text-ink-secondary" : "text-ink"}`}>
        <span>{claim.question}</span>
        {claim.note && (
          <span className="mt-0.5">
            <InfoButton label={`How "${claim.question}" is measured`}>{claim.note}</InfoButton>
          </span>
        )}
      </h3>

      {refused ? (
        <>
          {/* ── The refusal is stated, not struck ────────────────────────────
              This used to render struck through. **Strikethrough is a deletion
              mark**: in every document a reader has ever seen it means "this was
              here and we took it away", which invites them to wonder what the
              number said rather than read why there isn't one. It is a scar
              where a sentence belongs.

              The refusal still has to be *visible in place* — its absence would
              change how the other five panels read, and a blank reads as broken
              (§8 rule 3). So the panel keeps its slot and says the thing in
              words. Same content, no scar. */}
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-ink-secondary">Not published</span>
          </div>
          <p className="mt-2 max-w-[46ch] text-[11px] leading-relaxed text-ink-secondary">
            {claim.refusal}
          </p>
        </>
      ) : (
        <>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span
              className="tnum text-[22px] leading-none font-semibold"
              style={{ color: up ? "var(--good)" : "var(--ink)" }}
            >
              {r === null ? "—" : r >= 2 ? `${r.toFixed(1)}×` : delta(claim.lift!)}
            </span>
            <span className="text-[11px] text-ink-secondary">
              <span className="tnum font-medium text-ink">{fmt(claim.member, claim.unit)}</span>
              <span className="text-ink-muted"> vs </span>
              <span className="tnum">{fmt(claim.nonMember, claim.unit)}</span>
            </span>
          </div>

          {/* ── The shared axis, and the label that has to sit on it ─────────
              The 1.0× reference sits at the same x in every panel, which is the
              only reason six panels read as one picture.

              But the scale is load-bearing in a way that nearly cost the block
              its argument. On a log axis spanning 0.5× to 6×, a panel at 0.93×
              and a panel at 1.04× are **visually indistinguishable from the
              reference line** — so the two panels that refute the headline are
              precisely the two the scale erases, while 4.9× dominates the eye.
              A reader scanning the six would take away "members are worth much
              more" and miss that two of the six say otherwise.

              Every bar therefore carries its own value label. The shared scale
              keeps the ratios comparable; the label stops a near-null reading as
              nothing at all. */}
          <div className="relative mt-2.5 h-[26px]">
            <div className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-surface-sunken" />
            {r !== null && (
              <div
                className="absolute top-[11px] h-1 rounded-full"
                style={{
                  left: `${Math.min(ONE, position(r)) * 100}%`,
                  width: `${Math.max(Math.abs(position(r) - ONE) * 100, 0.6)}%`,
                  background: up ? "var(--good)" : "var(--warning)",
                }}
              />
            )}
            <div
              className="absolute top-[4px] bottom-[4px] w-px"
              style={{ left: `${ONE * 100}%`, background: "var(--ink-muted)" }}
            />
            <span
              className="absolute top-[16px] -translate-x-1/2 text-[9px] text-ink-muted"
              style={{ left: `${ONE * 100}%` }}
            >
              1.0×
            </span>
            {r !== null && (
              <span
                className="tnum absolute top-0 text-[10px] font-medium"
                style={{
                  left: `${Math.min(Math.max(position(r), 0.02), 0.86) * 100}%`,
                  color: up ? "var(--good)" : "var(--warning)",
                }}
              >
                {r.toFixed(2)}×
              </span>
            )}
          </div>

          <p className="mt-0.5 max-w-[46ch] text-[11px] leading-relaxed text-ink-muted">{claim.basis}</p>
        </>
      )}
    </div>
  );
}

/**
 * The correction. §5.5, and **it cannot be collapsed.**
 *
 * ── Why this is a separate export with a hard rule attached ────────────────
 *
 * The 4.9× is the number every stakeholder wants and it is an *association*. The
 * people who enrol were already coming back; roughly 97% of the observed gap was
 * there before anybody signed anything. The within-person estimate — the same
 * guests compared against themselves, before and after their first scan — puts
 * the effect of enrolling at +11.1%.
 *
 * Both are real and they answer different questions. The 4.9× sizes the base you
 * already have. **The +11.1% is the only one that may be used to justify the
 * programme**, and §5.6 sizes the opportunity on it for exactly that reason.
 *
 * There is no disclosure control here, no accordion and no "show method". A page
 * that leads with 4.9× and buries the correction is worse than not shipping the
 * section at all, so the correction is a sibling of the tile rather than a child
 * of it. `data-selection-correction` is on the wrapper so the layout test can
 * assert it shares a screen with the headline at 1280px and 1920px.
 */
export function SelectionCorrection({
  association, causal, selectionShare, n, refusal,
}: {
  association: number;
  causal: { lift: number; lo: number; hi: number } | null;
  selectionShare: number | null;
  n: number;
  refusal: string | null;
}) {
  return (
    <div
      data-selection-correction=""
      className="grid gap-px overflow-hidden rounded-lg border bg-line sm:grid-cols-3"
      style={{ borderColor: "var(--warning)" }}
    >
      <Cell
        label="Observed gap"
        value={ratio(association)}
        sub="association"
        note="Members against non-members, as they are. Cross-sectional."
        tone="var(--ink-muted)"
      />
      {causal ? (
        <>
          <Cell
            label="Caused by enrolling"
            value={delta(causal.lift, 1)}
            sub={`95% CI ${delta(causal.lo, 1)} to ${delta(causal.hi, 1)} · n=${count(n)}`}
            note="The same guests compared against themselves, before and after their first scan."
            tone="var(--good)"
          />
          <Cell
            label="Was already there"
            value={selectionShare === null ? "—" : pct(selectionShare, 0)}
            sub="selection, not effect"
            note="People who were already coming back, choosing to enrol. The within-person design does not explain this share."
            tone="var(--warning)"
          />
        </>
      ) : (
        <div className="bg-surface-raised px-4 py-3.5 sm:col-span-2">
          <div className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">
            Caused by enrolling
          </div>
          <div className="tnum mt-1 text-[20px] leading-none font-semibold text-ink-muted line-through decoration-2">
            not published
          </div>
          <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-ink-secondary">{refusal}</p>
        </div>
      )}
    </div>
  );
}

function Cell({
  label, value, sub, note, tone,
}: {
  label: string;
  value: string;
  sub: string;
  note: string;
  tone: string;
}) {
  return (
    <div className="bg-surface-raised px-4 py-3.5" style={{ borderTop: `2px solid ${tone}` }}>
      <div className="text-[12px] font-medium tracking-wide text-ink-secondary uppercase">{label}</div>
      <div className="tnum mt-1 text-[24px] leading-none font-semibold text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-ink-muted">{sub}</div>
      <p className="mt-1.5 max-w-[42ch] text-[11px] leading-relaxed text-ink-secondary">{note}</p>
    </div>
  );
}
