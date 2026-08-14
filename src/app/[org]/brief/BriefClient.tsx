"use client";

import { useState } from "react";
import { IconCheck, IconMail, IconPrint, IconX } from "@/components/shell/Icons";
import { Card, EmptyState, Pill } from "@/components/ui/Primitives";
import type { Brief, NamedList } from "@/lib/metrics";
import { count, dayLabel, habit, money } from "@/lib/metrics";
import type { Org } from "@/lib/types";

/**
 * The Brief.
 *
 * Not a report — a delivered message. Three objects: the pre-shift card that gets
 * read aloud in under a minute, the printed sheet that goes on the pass, and the
 * return tap that closes the loop. The loop is the product: a dashboard that ends
 * in a number ends there, and nobody comes back to it.
 */
export function BriefClient({
  org, brief, lists, generatedFor,
}: {
  org: Org;
  brief: Brief;
  lists: NamedList[];
  generatedFor: string;
}) {
  const [done, setDone] = useState<Record<string, "called" | "skipped" | undefined>>({});
  const [active, setActive] = useState(lists[0]?.key ?? "");
  const list = lists.find((l) => l.key === active) ?? lists[0];

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* the pre-shift card */}
        <Card
          title="Pre-shift brief"
          subtitle={`For the shift starting ${dayLabel(generatedFor)} · read aloud in under a minute`}
          right={
            <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-muted">
              {brief.wordCount} words
            </span>
          }
        >
          {brief.silent ? (
            <EmptyState
              title={brief.headline}
              body={
                <>
                  {brief.lines[0]}
                  <p className="mt-2">
                    Nothing is sent on a quiet week. A brief that always speaks is a
                    brief nobody reads.
                  </p>
                </>
              }
            />
          ) : (
            <div className="rounded-xl border border-line bg-surface-sunken p-5">
              <p className="text-[17px] leading-snug font-semibold text-ink">{brief.headline}</p>
              {brief.lines.map((l) => (
                <p key={l} className="mt-2 text-[14px] leading-relaxed text-ink-secondary">{l}</p>
              ))}

              <ol className="mt-4 space-y-2">
                {brief.names.map((n, i) => (
                  <li key={n.name} className="flex gap-3 text-[14px]">
                    <span className="tnum mt-0.5 w-4 shrink-0 text-ink-muted">{i + 1}.</span>
                    <span>
                      <strong className="text-ink">{n.name}</strong>
                      <span className="text-ink-secondary"> — {n.fact}</span>
                    </span>
                  </li>
                ))}
              </ol>

              {brief.action && (
                <p className="mt-4 border-t border-line pt-3 text-[14px] font-semibold text-ink">
                  {brief.action}.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-medium hover:bg-surface-hover"
            >
              <IconPrint className="h-4 w-4" /> Print the staff sheet
            </button>
            <span className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-ink-muted">
              <IconMail className="h-4 w-4" /> Emailed 6:00am daily
            </span>
          </div>
        </Card>

        {/* the return tap */}
        <Card title="Did you get to it?" subtitle="The return tap. Without it there is no measurement, and without measurement there is no product.">
          {brief.silent ? (
            <p className="text-[13px] text-ink-secondary">Nothing to report back this week.</p>
          ) : (
            <ul className="space-y-2">
              {brief.names.map((n) => {
                const state = done[n.name];
                return (
                  <li
                    key={n.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                  >
                    <span className="truncate text-[14px] font-medium text-ink">{n.name}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <Tap
                        active={state === "called"}
                        tone="good"
                        onClick={() => setDone((d) => ({ ...d, [n.name]: state === "called" ? undefined : "called" }))}
                      >
                        <IconCheck className="h-3.5 w-3.5" /> We called
                      </Tap>
                      <Tap
                        active={state === "skipped"}
                        tone="muted"
                        onClick={() => setDone((d) => ({ ...d, [n.name]: state === "skipped" ? undefined : "skipped" }))}
                      >
                        <IconX className="h-3.5 w-3.5" /> Didn&rsquo;t get to it
                      </Tap>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-secondary">
            Return-tap rate is the leading indicator for the one metric that matters:
            Oolio Pay volume retention among merchants receiving four or more
            consecutive briefs, against a matched comparison group.
          </p>
        </Card>
      </div>

      {/* the weekly digest — the named lists in full */}
      <Card
        title="Weekly digest"
        subtitle="The four-minute object. Every list is a group of named people with one thing to do."
        padded={false}
      >
        <div className="flex flex-wrap gap-1 border-b border-line px-5 py-3">
          {lists.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setActive(l.key)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                l.key === active ? "bg-accent-soft text-accent" : "text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              {l.title}
              <span className="tnum ml-2 text-ink-muted">{count(l.total)}</span>
            </button>
          ))}
        </div>

        {list && (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4">
              <p className="max-w-[70ch] text-[13px] leading-relaxed text-ink-secondary">{list.why}</p>
              {list.valueAtRisk ? (
                <p className="text-[13px]">
                  <span className="text-ink-muted">Value at risk </span>
                  <span className="tnum font-semibold text-ink">{money(list.valueAtRisk)}</span>
                  <span className="text-ink-muted"> a quarter</span>
                </p>
              ) : null}
            </div>

            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-y border-line bg-surface-sunken text-left text-[12px] text-ink-secondary">
                  <th className="px-5 py-2 font-medium">{org.labels.guest}</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 text-right font-medium">{org.labels.visits}</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  <th className="px-3 py-2 font-medium">Habit</th>
                  <th className="px-5 py-2 font-medium">Home venue</th>
                </tr>
              </thead>
              <tbody>
                {list.guests.map((g) => (
                  <tr key={g.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                    <td className="px-5 py-2 font-medium text-ink">{g.name}</td>
                    <td className="px-3 py-2">
                      <Pill tone={g.tier === "member" ? "member" : "card"}>
                        {g.tier === "member" ? "Member" : "Card"}
                      </Pill>
                    </td>
                    {/* Grids never round. */}
                    <td className="tnum px-3 py-2 text-right">{g.visits}</td>
                    <td className="tnum px-3 py-2 text-right">{money(g.spend)}</td>
                    <td className="px-3 py-2 text-ink-secondary">{habit(g, org)}</td>
                    <td className="px-5 py-2 text-ink-secondary">{g.homeStore}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {list.total > list.guests.length && (
              <p className="border-t border-line px-5 py-3 text-[12px] text-ink-muted">
                Showing the {list.guests.length} most urgent of {count(list.total)}. A list
                longer than a shift can act on is a list nobody acts on.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Tap({
  children, active, tone, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  tone: "good" | "muted";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors"
      style={
        active
          ? {
              background: tone === "good" ? "var(--good)" : "var(--ink-muted)",
              borderColor: "transparent",
              color: "#fff",
            }
          : { borderColor: "var(--line)", color: "var(--ink-secondary)" }
      }
    >
      {children}
    </button>
  );
}
