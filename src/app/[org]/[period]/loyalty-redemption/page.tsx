import { FlatBars, FlatPanel, FlatTile, Placeholder } from "@/components/shell/Placeholder";

export const dynamic = "force-static";

/**
 * Loyalty Redemption. **Production. Not built, not changed, not fixed here.**
 *
 * ── One deliberate omission ────────────────────────────────────────────────
 *
 * The live report carries a redemption rate of **118.64%**, which is a defect
 * tracked as OR-1803. §9 lists it among the data traps with a single
 * instruction: *do not surface it anywhere.*
 *
 * So this stand-in does not reproduce it — not in the tiles, not in a chart, not
 * as a struck-through figure with a footnote. A wrong number reprinted with a
 * caveat is still a wrong number in a screenshot, and this build has no standing
 * to publish a figure it did not measure and cannot correct. The row where a
 * redemption rate would sit says why it is absent instead.
 *
 * This is the one place in the product where a blank is right rather than a
 * refusal-with-reason: §8 rule 3 governs *our* figures, and refusing to restate
 * somebody else's known-bad number is a different act from declining to publish
 * one of our own.
 */
export default function LoyaltyRedemptionPage() {
  return (
    <Placeholder
      title="Loyalty Redemption"
      standfirst="Loyalty Redemption ships today and is unchanged by this proof of concept. It is here so the Customers section reads whole when you click down the sidebar."
      note={
        <div className="rounded-xl border border-line bg-surface-sunken px-5 py-4">
          <h2 className="text-[14px] font-semibold text-ink">One figure is deliberately absent</h2>
          <p className="mt-1.5 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            The live report publishes a redemption rate above 100%, which is a known defect tracked
            as <code className="text-[12px]">OR-1803</code>. It is not reproduced here in any form —
            not as a tile, not struck through, not with a caveat. A wrong number reprinted with an
            explanation is still a wrong number the moment somebody screenshots it.
          </p>
          <p className="mt-2 max-w-[92ch] text-[13px] leading-relaxed text-ink-secondary">
            This build did not measure that rate and cannot correct it, so it has no standing to
            restate it. That is the owning team&apos;s to fix on the live screen.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-4">
          <FlatTile label="Rewards issued" value="12,884" sub="in period" />
          <FlatTile label="Rewards redeemed" value="4,271" sub="in period" />
          <FlatTile label="Redeemed value" value="$28,613" sub="discount applied at till" />
          <FlatTile
            label="Redemption rate"
            value="—"
            sub="Not reproduced. See the note below the report."
          />
        </div>

        <FlatPanel title="Redemptions by month" subtitle="Rewards redeemed at the till">
          <FlatBars
            max={1_612}
            colour="var(--tier-member)"
            rows={[
              { label: "March", value: 1_284, display: "1,284" },
              { label: "April", value: 1_351, display: "1,351" },
              { label: "May", value: 1_449, display: "1,449" },
              { label: "June", value: 1_612, display: "1,612" },
              { label: "July", value: 1_538, display: "1,538" },
            ]}
          />
        </FlatPanel>

        <FlatPanel title="Redemptions by reward" subtitle="Which offers are actually used">
          <FlatBars
            max={2_106}
            rows={[
              { label: "Free coffee", value: 2_106, display: "2,106" },
              { label: "$5 off", value: 1_042, display: "1,042" },
              { label: "Buy one get one", value: 683, display: "683" },
              { label: "Birthday reward", value: 291, display: "291" },
              { label: "Welcome offer", value: 149, display: "149" },
            ]}
          />
        </FlatPanel>

        <FlatPanel title="Redemptions by venue" subtitle="Top venues in period">
          <FlatBars
            max={512}
            rows={[
              { label: "Belconnen", value: 512, display: "512" },
              { label: "Gungahlin", value: 447, display: "447" },
              { label: "Woden", value: 401, display: "401" },
              { label: "Tuggeranong", value: 366, display: "366" },
              { label: "Amaroo", value: 294, display: "294" },
            ]}
          />
        </FlatPanel>
      </div>
    </Placeholder>
  );
}
