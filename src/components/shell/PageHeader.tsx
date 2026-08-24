import type { ReactNode } from "react";
import { spineState } from "@/lib/window";
import { CoverageChip } from "@/components/ui/CoverageChip";
import { ChecksDrawer } from "@/components/ui/ChecksDrawer";
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
  org, title, section, coverage, filters, actions, periods, period, checks,
  coverageScope = "card", population = true,
}: {
  org: Org;
  title: string;
  /**
   * The section this report belongs to, beside the title.
   *
   * It was the literal string "Customers" until there was a second section, at
   * which point every Team page quietly claimed to be a customer report. A label
   * that is right by coincidence stops being right the moment the product grows.
   *
   * **It is required, and it stopped defaulting when there were eight sections.**
   * A default is a guess that a new page will belong to whichever section
   * happened to be first, and with eight to choose from that guess is wrong
   * seven times out of eight — silently, on a page that renders perfectly. The
   * compiler asking the question once is cheaper than a Finance report labelled
   * Guests.
   */
  section: string;
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
  /**
   * Whether this surface has a population to narrow. See `FilterBar.population`.
   * False only on Home, which is a landing state rather than a report.
   */
  population?: boolean;
}) {
  return (
    <header className="shrink-0 border-b border-line bg-surface">
      <div className="flex items-center justify-between gap-4 px-6 pt-4 pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold text-ink">{title}</h1>
          <span className="text-[13px] text-ink-muted">{section}</span>
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
          {/* ── The session chip left this header ───────────────────────
              Sign out moved to the foot of the rail, which left a chip saying
              only "Signed in as Oolio (internal)" beside a menu on the mark
              saying the same words. Two copies of one fact, and the header's
              copy sat among coverage and check chips whose job is to qualify a
              figure. Identity is in the account menu; the organisation whose
              figures these are is under the Insights heading, where it is
              visible without a click. */}
          {actions}
          {/* C-4. This was `<CheckBadge href="#checks" />` and `#checks` did not
              exist on any page — the anchor's host section was removed from
              Overview and is now rendered nowhere. The register travels with the
              chip instead, so it cannot come apart from it again. */}
          {checks && <ChecksDrawer checks={checks} />}
          {coverage && (
            <CoverageChip state={coverage} scope={coverageScope} spine={spineState(org)} />
          )}
        </div>
      </div>

      <FilterBar org={org} periods={periods} period={period} extra={filters} population={population} />
    </header>
  );
}

/**
 * The scrolling body of a report, and the edge where it meets the chrome.
 *
 * The header above this had a 1px rule under it whether or not there was
 * anything beneath to divide — a divider drawn on principle rather than on
 * evidence. The sentinel below is a zero-height sticky element at the top of
 * the scroller that fades a soft edge in over the first 24px of scroll and is
 * invisible at rest, so the separation appears exactly when content starts
 * passing under the chrome.
 *
 * It is a CSS scroll-driven animation, so there is no scroll listener and no
 * client boundary on a page that is otherwise entirely server-rendered. Where
 * `animation-timeline` is unsupported it never appears, which is what this
 * looked like before.
 */
export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div data-scroll-edge="" aria-hidden />
      <div className="p-6">{children}</div>
    </div>
  );
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
