import type { ReactNode } from "react";
import { CoverageChip } from "@/components/ui/CoverageChip";
import { CheckBadge } from "@/components/ui/Primitives";
import { FilterBar } from "@/components/shell/FilterBar";
import type { Period, Periods } from "@/lib/periods";
import type { CoverageState } from "@/lib/metrics";
import type { Check } from "@/lib/checks";
import type { Org } from "@/lib/types";

/**
 * Page header and the **one** filter bar.
 *
 * Every built report renders this, so there is exactly one filter bar in the
 * product and one implementation of it (§12). Report-specific controls arrive
 * through `filters` and render *inside* the same bar rather than beside it — the
 * previous build grew a second control cluster inside the guest grid's card
 * header, which meant two places to look for the same question.
 *
 * The two chips live here because they are chrome rather than content: the check
 * badge and the recognition share follow the reader between reports, and both
 * open on click rather than on hover (§8 rule 7 — hover does not exist on touch).
 */
export function PageHeader({
  org, orgs, title, coverage, filters, actions, periods, period, checks, coverageScope = "card",
}: {
  org: Org;
  orgs: { slug: string; name: string }[];
  title: string;
  coverage?: CoverageState;
  /** Report-specific controls, rendered inside the shared bar. */
  filters?: ReactNode;
  actions?: ReactNode;
  periods: Periods;
  period: Period;
  checks?: Check[];
  /**
   * What the recognition chip is describing on this page. Behaviour carries
   * both tiers, so its chip must say so rather than assert the card-tier
   * figure over member-tier content.
   */
  coverageScope?: "card" | "mixed";
}) {
  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold text-ink">{title}</h1>
          <span className="text-[13px] text-ink-muted">Customers</span>
          <BuildStamp />
        </div>
        {/* ── The recognition chip is scoped to what it describes ─────────────
            It asserted "Recognising 82.4% of revenue" persistently, on every
            page, above every block. That is a card-tier figure, and on Behaviour
            it sat above a member-tier section covering roughly a fifth of
            orders — a chip claiming 82.4% over a 19% population is not a
            caveat problem, it is wrong.

            It now says which tier it is describing. On a page that carries both,
            it says so, and the wall inside the page carries the member-tier
            figure where the member-tier content starts. */}
        <div className="flex items-center gap-2">
          {actions}
          {checks && <CheckBadge href="#checks" checks={checks} />}
          {coverage && <CoverageChip state={coverage} scope={coverageScope} />}
        </div>
      </div>

      <FilterBar org={org} orgs={orgs} periods={periods} period={period} extra={filters} />
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-6">{children}</div>;
}

/**
 * The build, on every screen.
 *
 * This artefact is screenshotted constantly and the screenshots outlive the
 * build that produced them. "The grid showed 4,966 there" is unanswerable when
 * nobody can say which build *there* was — and the meaning of that number has
 * genuinely changed more than once in this repo, most recently when the card
 * tier started carrying a lifecycle verdict.
 *
 * Version first because it says which phase of the plan you are looking at,
 * then the commit, because that is the part you can check out and re-run.
 * `title` carries the build date so it is one hover away without spending
 * header width on it.
 *
 * Deliberately quiet: this is provenance, not a figure, and it sits at the same
 * weight as the section label rather than competing with the page title.
 */
function BuildStamp() {
  const version = process.env.NEXT_PUBLIC_VERSION;
  const commit = process.env.NEXT_PUBLIC_COMMIT;
  if (!version) return null;
  return (
    <span
      className="tnum rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-muted"
      title={`Built ${process.env.NEXT_PUBLIC_BUILD_DATE} from commit ${commit}`}
    >
      v{version}
      {commit && <span className="ml-1 opacity-70">{commit}</span>}
    </span>
  );
}
