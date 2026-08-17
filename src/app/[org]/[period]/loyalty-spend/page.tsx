import { FlatBars, FlatPanel, FlatTile, Placeholder } from "@/components/shell/Placeholder";

export const dynamic = "force-static";

/**
 * Loyalty Spend. **Production. Not built, not changed, not fixed here.**
 *
 * ── The one thing worth knowing, so nobody tries to "fix" it ───────────────
 *
 * This report leads with *"Loyalty Customers $9.73 average spend"* against
 * *"Non-Loyalty $12.95"*, and a reader's first instinct is that it has the sign
 * backwards. **It does not. Per order that figure is correct.**
 *
 * It is the wrong denominator for the question people ask of it. Per *person* the
 * comparison runs the other way — $160.14 against $32.41 — because members return
 * 11.1 times against 2.1. Both numbers are true and they answer different
 * questions.
 *
 * **We do not change their screen.** Overview §5.5 publishes both figures side by
 * side with the reason, which is the right place for it: a per-order average is a
 * fair thing for a spend report to lead with, and the correction belongs where
 * the per-person claim is being made.
 */
export default function LoyaltySpendPage() {
  return (
    <Placeholder
      title="Loyalty Spend"
      standfirst="Loyalty Spend ships today and is unchanged by this proof of concept. It is here so the Customers section reads whole when you click down the sidebar."
      note={
        <div className="rounded-xl border border-line bg-surface-sunken px-5 py-4">
          <h2 className="text-[14px] font-semibold text-ink">
            The headline above is correct, and it is not the whole answer
          </h2>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            <strong className="text-ink">Per order, members do spend less.</strong> $9.73 against
            $12.95 is a real measurement and this report is right to publish it. Per <em>person</em>{" "}
            the comparison reverses — $160.14 against $32.41 — because members come back 11.1 times
            in the window against 2.1. It is a frequency effect, not a basket effect.
          </p>
          <p className="mt-2 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            That correction is published on <strong className="text-ink">Overview</strong>, beside
            the per-person figure it qualifies. It is not published here, and this screen is not
            being changed to carry it.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          <FlatTile label="Loyalty customers" value="$9.73" sub="average spend per order" />
          <FlatTile label="Non-loyalty" value="$12.95" sub="average spend per order" />
          <FlatTile label="Loyalty orders" value="38,431" sub="orders carrying a scan" />
          <FlatTile label="Loyalty sales" value="$373,935" sub="scanned trade in period" />
        </div>

        <FlatPanel title="Average spend" subtitle="Loyalty against non-loyalty, per order">
          <FlatBars
            max={12.95}
            rows={[
              { label: "Non-loyalty", value: 12.95, display: "$12.95" },
              { label: "Loyalty", value: 9.73, display: "$9.73" },
            ]}
          />
        </FlatPanel>

        <FlatPanel title="Spend by tier" subtitle="Members grouped by programme tier">
          <FlatBars
            max={186_420}
            colour="var(--tier-member)"
            rows={[
              { label: "Bronze", value: 186_420, display: "$186,420" },
              { label: "Silver", value: 112_884, display: "$112,884" },
              { label: "Gold", value: 58_106, display: "$58,106" },
              { label: "Platinum", value: 16_525, display: "$16,525" },
            ]}
          />
        </FlatPanel>

        <FlatPanel title="Spend by venue" subtitle="Scanned trade, top venues">
          <FlatBars
            max={41_308}
            rows={[
              { label: "Belconnen", value: 41_308, display: "$41,308" },
              { label: "Gungahlin", value: 36_142, display: "$36,142" },
              { label: "Woden", value: 33_901, display: "$33,901" },
              { label: "Tuggeranong", value: 29_774, display: "$29,774" },
              { label: "Amaroo", value: 24_660, display: "$24,660" },
            ]}
          />
        </FlatPanel>
      </div>
    </Placeholder>
  );
}
