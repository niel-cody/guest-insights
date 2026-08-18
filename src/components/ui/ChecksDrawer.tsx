"use client";

import { useEffect, useRef, useState } from "react";
import { IconAlert, IconCheck, IconX } from "@/components/shell/Icons";
import { Pill } from "@/components/ui/Primitives";
import type { Check } from "@/lib/checks";

/**
 * The check register, behind the badge that claims it. **C-4.**
 *
 * ── The defect ─────────────────────────────────────────────────────────────
 *
 * The header chip read "27 checks pass · 1 to review" and linked to `#checks`.
 * Nothing on any page had that id: the anchor lived inside `TrustPanel`, which
 * was removed from Overview when the trust material was moved out of the middle
 * of the report, and is now rendered nowhere at all. So the chip was a dead link
 * on every screen in the product.
 *
 * That is worse than an ordinary broken link. **It is the first thing a
 * technical buyer clicks**, it is the build's own claim to rigour, and a claim
 * that cannot be opened is a claim. The whole argument of this artefact is that
 * a check must be provably capable of failing; a badge nobody can open is
 * exactly the same failure one level up.
 *
 * ── Why a drawer and not a page ────────────────────────────────────────────
 *
 * The chip is chrome — it follows the reader across every report — so its
 * destination has to exist on every report too. An anchor needs a host section
 * on each page, which is how it broke the first time. A drawer travels with the
 * chip, and it is the same affordance Task 0 put on every panel, so a reader who
 * has opened one has already learned this one.
 */
export function ChecksDrawer({ checks }: { checks: Check[] }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const blockingFailed = checks.filter((c) => !c.ok && c.severity === "blocking").length;
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning").length;
  // A firing warning is the product working, not the build failing: it is how a
  // page knows to withhold a comparison. Only a blocking failure means a number
  // on screen cannot be trusted, and only that turns the badge red.
  const tone =
    blockingFailed > 0 ? "var(--critical)" : warnings > 0 ? "var(--warning)" : "var(--good)";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prior;
    };
  }, [open]);

  // Failures first. A reader opening this because the badge is amber should not
  // have to scan twenty-seven passing rows to find the one that is not.
  const ordered = [...checks].sort((a, b) => Number(a.ok) - Number(b.ok));

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        style={{ borderColor: tone, color: tone }}
      >
        {blockingFailed > 0 ? <IconAlert className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
        {blockingFailed > 0
          ? `${blockingFailed} of ${checks.length} checks failing`
          : `${checks.length - warnings} checks pass`}
        {warnings > 0 && <span className="opacity-75">· {warnings} to review</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="The check register"
            tabIndex={-1}
            className="relative flex h-full w-full max-w-[520px] flex-col border-l border-line bg-surface shadow-2xl outline-none"
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
                  What this report is standing on
                </p>
                <h2 className="mt-0.5 text-[15px] font-semibold text-ink">The check register</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                aria-label="Close"
                className="-mr-1 inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <IconX className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="max-w-[70ch] text-[13px] leading-relaxed text-ink-secondary">
                A previous build shipped five checks that were internal identities — they compared a number
                to itself and <strong className="text-ink">could not fail</strong>. They were green on the
                day the card feed collapsed 403,600 transactions onto one token.{" "}
                <strong className="text-ink">A check with no failing fixture is excluded from this badge</strong>,
                which is why the count here is lower than the number of assertions in the codebase.
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-md border border-line bg-surface-sunken px-2 py-1 text-ink-secondary">
                  <strong className="text-ink">{checks.filter((c) => c.ok).length}</strong> passing
                </span>
                {warnings > 0 && (
                  <span
                    className="rounded-md border px-2 py-1"
                    style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
                  >
                    <strong>{warnings}</strong> to review
                  </span>
                )}
                {blockingFailed > 0 && (
                  <span
                    className="rounded-md border px-2 py-1"
                    style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
                  >
                    <strong>{blockingFailed}</strong> blocking
                  </span>
                )}
              </div>

              <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
                {ordered.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 shrink-0"
                        style={{
                          color: c.ok
                            ? "var(--good)"
                            : c.severity === "warning"
                              ? "var(--warning)"
                              : "var(--critical)",
                        }}
                      >
                        {c.ok ? <IconCheck className="h-3.5 w-3.5" /> : <IconAlert className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <code className="text-[11px] font-medium text-ink">{c.id}</code>
                          {!c.ok && (
                            <Pill tone={c.severity === "warning" ? "warning" : "critical"}>
                              {c.severity === "warning" ? "Review" : "Blocking"}
                            </Pill>
                          )}
                          {c.proof === "unit" && (
                            <span className="text-[10px] text-ink-muted">proven in code, not by fixture</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{c.rule}</p>
                        {/* What it catches is the part that makes a register
                            readable by somebody who did not write it. A rule is
                            an assertion; a named historical defect is a reason. */}
                        <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                          Catches: {c.catches}
                        </p>
                        <p className="tnum mt-0.5 text-[11px] text-ink-muted">{c.detail}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
