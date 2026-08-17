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
      <h3
        className={`text-[13px] font-semibold ${refused ? "text-ink-muted line-through decoration-2" : "text-ink"}`}
      >
        {claim.question}
      </h3>

      {refused ? (
        <>
          {/* §8 rule 3. Struck through, not blank — and the strike is on the
              figures as well as the title, so it reads as withheld rather than
              as missing. */}
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-[15px] font-semibold text-ink-muted line-through decoration-2">
              not published
            </span>
          </div>
          <div className="mt-2 h-[26px]" />
          <p className="max-w-[46ch] text-[11px] leading-relaxed text-ink-secondary">
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

          {/* The shared axis. The 1.0× reference sits at the same x in every
              panel, which is the only reason six panels can be read as one
              picture. */}
          <div className="relative mt-2.5 h-[26px]">
            <div className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-surface-sunken" />
            {r !== null && (
              <div
                className="absolute top-[11px] h-1 rounded-full"
                style={{
                  left: `${Math.min(ONE, position(r)) * 100}%`,
                  width: `${Math.abs(position(r) - ONE) * 100}%`,
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
