/**
 * Layout assertions against the built HTML.
 *
 *   npm run build && npm run test:layout
 *
 * ── Why these are asserted on the output rather than reviewed ──────────────
 *
 * §12's rule is that a box is ticked by looking at the running build, never by
 * reading the code. These are the display rules that a code review will pass and
 * a rendered page will fail: a correction that got wrapped in a disclosure
 * during a refactor, a refusal that became a blank, an info icon that came back.
 * Each one has a history.
 *
 * The geometric half of §5.5 — that the 4.9× and its correction share a viewport
 * at 1280px and 1920px — needs a browser and is measured there. What this
 * asserts is the **structure that makes the geometry hold**: the correction is a
 * sibling of the panels rather than a child of a `<details>`, and nothing
 * collapsible sits between them. If those hold, the block cannot be pushed off
 * screen by a future edit without this failing first.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", ".next", "server", "app");

let failures = 0;
let passes = 0;

function check(name: string, pass: boolean, detail = "") {
  if (pass) passes++;
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Every prerendered HTML file under the app output. */
async function pages(dir: string, acc: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await pages(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/** The slice of markup between two indexes, for locality assertions. */
function between(html: string, from: number, to: number): string {
  return from >= 0 && to > from ? html.slice(from, to) : "";
}

async function main() {
  let files: string[];
  try {
    files = await pages(OUT);
  } catch {
    console.error("No build output found. Run `npm run build` first.");
    process.exit(1);
  }

  console.log(`\n${files.length} prerendered pages`);

  for (const file of files) {
    const html = await readFile(file, "utf8");
    const name = file.replace(OUT, "").replace(/\.html$/, "");
    const isOverview = name.endsWith("/overview");
    const isPlaceholder = /loyalty-(spend|redemption)$/.test(name);
    // The org and root routes are redirects with no chrome. Asserting a sidebar
    // on them would be asserting against a page that has no reader.
    const isReport =
      isOverview || isPlaceholder || /\/(behaviour|guests)$/.test(name);

    console.log(`\n${name}`);

    // ── §5.5: the correction cannot be collapsed or separated ──────────────
    if (isOverview) {
      const corrIdx = html.indexOf("data-selection-correction");
      check("the selection correction is present", corrIdx >= 0);

      if (corrIdx >= 0) {
        const headIdx = html.indexOf("So what is a member worth");
        check("the 4.9× panel is present", headIdx >= 0);

        // Nothing collapsible between the headline and the correction. A
        // `<details>` opening in that span is how the correction ends up behind
        // a click without anybody deciding that it should be.
        const span = between(html, headIdx, corrIdx);
        check(
          "nothing collapsible sits between the 4.9× panel and its correction",
          !span.includes("<details"),
          "a <details> opened in the span between them",
        );
        check(
          "the correction follows the panel it corrects",
          headIdx >= 0 && corrIdx > headIdx,
          "the correction renders before the figure it corrects",
        );

        // The correction is not inside any disclosure at all. Counting opens
        // against closes before it is a cheap and reliable proxy for nesting.
        const before = html.slice(0, corrIdx);
        const opens = (before.match(/<details/g) ?? []).length;
        const closes = (before.match(/<\/details>/g) ?? []).length;
        check("the correction is not nested inside a disclosure", opens === closes,
          `${opens - closes} unclosed <details> before it`);

        // §5.2's hard rule: the tile does not exist without the block.
        check(
          "the 4.9× tile does not render without the correction",
          !html.includes("A member is worth") || corrIdx >= 0,
        );
      }

      // ── §5.7: the trust panel is gone from Overview ──────────────────────
      //
      // It used to be asserted *present* here. "What this report is standing
      // on" was the most rigorous panel in the build sitting in the middle of
      // the page an operator opens to ask what is happening to their customers,
      // and it taught them to scroll past the middle — which is where the two
      // findings now live. The rigour did not move into a fold; it was already
      // reachable from every screen. What is asserted instead is that the two
      // things that made the panel load-bearing are still true.
      check("the trust panel has left Overview",
        !html.includes("What this report is standing on"),
        "the coverage report is back in the middle of the page");
      // The check badge is what survives the panel: it states the count and it
      // is a link, so the evidence is still one click from the page that
      // dropped the long version. A static span reading "5 checks pass" is what
      // v1 shipped, so the assertion is on the anchor, not on the words.
      check("the check badge is still on Overview and is a link",
        /<a[^>]*>(?:(?!<\/a>)[\s\S])*checks (?:pass|failing)/.test(html),
        "the badge is absent or is no longer a link to the evidence");

      // ── The two findings are open, not folded ────────────────────────────
      //
      // `Disclosure` keeps its result line visible either way, so this is not a
      // correctness rule — it is the editorial one that replaced the trust
      // panel. A finding behind a click is a finding nobody reads.
      for (const finding of ["Where the change came from", "What members and everyone else actually buy"]) {
        const i = html.indexOf(finding);
        if (i < 0) continue;
        const block = html.slice(i, i + 2000);
        check(`"${finding}" is open by default`,
          /<details[^>]*\sopen/.test(block),
          "it renders folded");
      }
    }

    // ── A refusal is stated with its reason, and never left blank ──────────
    //
    // This used to assert a strikethrough. **Strikethrough is a deletion mark**
    // — it reads as "this was here and we took it away", which makes a reader
    // wonder what the number said rather than read why there isn't one. The
    // rule it was enforcing is the one that matters and it is unchanged: a
    // refusal must be *visible in place*, because its absence would change how
    // the figures beside it read, and a blank reads as broken.
    //
    // So what is asserted now is the substance: wherever a figure is refused,
    // a reason follows it within the same block. A "Not published" with nothing
    // after it is the failure this catches.
    //
    // Matched on the rendered figure rather than on the phrase, which also
    // appears in prose explaining why something is not published elsewhere.
    for (const m of html.matchAll(/>Not published</g)) {
      // The property, not the vocabulary: a paragraph of real prose follows.
      // Keying on words like "because" fails on refusals that are correctly
      // worded and simply phrase it differently, which is a test that punishes
      // good writing.
      // Tag-agnostic: the reason may be a paragraph in a value panel or a
      // footnote span in a tile. What matters is that a reader meets real prose
      // straight after the refusal, not which element carries it.
      const after = html.slice(m.index, m.index + 1400).replace(/<[^>]+>/g, " ");
      const words = after.replace(/^\s*Not published[.\s]*/i, "").trim().split(/\s+/);
      check("a refused figure is followed by its reason",
        words.length >= 20,
        `a refusal at offset ${m.index} states no reason — ${words.length} words follow it`);
      check("a refused figure is not struck through",
        !html.slice(Math.max(0, m.index - 200), m.index + 200).includes("line-through"),
        `a refusal at offset ${m.index} is struck through — say it, do not scar it`);
    }

    // ── §8 rule 7, replaced rather than deleted ────────────────────────────
    //
    // The old rule was "no info icons anywhere", written after the prototype
    // shipped four that **rendered nothing at all** when clicked. That rule has
    // been lifted: the tiles were carrying three lines of prose each, and four
    // of those across the top of a page is a wall a reader skims — the same
    // failure the rule prevented, reached from the other side.
    //
    // What replaces it is the two conditions the reversal came with, asserted
    // on the rendered output rather than trusted to the component:
    //
    //   1. it is a real button, so it works on touch and by keyboard;
    //   2. it cannot be empty, which is the original defect.
    //
    // `cursor-help` is still banned outright. It is the CSS of a hover-only
    // affordance and it has no keyboard or touch story at all.
    check("no hover-only help cursor anywhere",
      !/cursor-help/.test(html),
      "a cursor-help element is back — hover is not an affordance on touch");

    // Every info trigger is a <button> that declares its state and names
    // itself. Matched on `data-info-button`, which `InfoButton` stamps on all
    // of them — matching the aria-label instead would only find the ones `Tile`
    // generates, and the hand-written ones are exactly the ones likely to be
    // built wrong.
    for (const m of html.matchAll(/data-info-button=""/g)) {
      const el = html.slice(Math.max(0, m.index - 300), m.index + 300);
      check("an info trigger is a real button",
        /<button[^>]*data-info-button/.test(el),
        `the trigger at offset ${m.index} is not a <button>`);
      check("an info trigger declares its expanded state",
        /aria-expanded/.test(el),
        `the trigger at offset ${m.index} has no aria-expanded`);
      check("an info trigger names itself for assistive tech",
        /aria-label="[^"]+"/.test(el),
        `the trigger at offset ${m.index} has no aria-label`);
    }

    // The reversal is conditional on the buttons existing where the prose was
    // removed from. A page whose tiles lost their explanation and gained no
    // button has quietly deleted the explanation.
    if (isOverview || name.endsWith("/guests")) {
      check("the tiles carry their explanation behind a button",
        (html.match(/data-info-button/g) ?? []).length >= 4,
        `${(html.match(/data-info-button/g) ?? []).length} info buttons on a page with four tiles`);
    }

    // ── §8 rule 2: no dual vertical axes, ever ─────────────────────────────
    check("no chart declares a second vertical axis", !html.includes("data-second-axis"));

    // ── §11: the network graph, map and decay model are gone ───────────────
    for (const gone of ["VenueNetwork", "distance-decay", "decay exponent", "Decay exponent"]) {
      check(`no trace of "${gone}"`, !html.includes(gone));
    }

    // ── §3: the placeholders are labelled and carry no data ────────────────
    if (isPlaceholder) {
      check("the placeholder is labelled", html.includes("Existing report. Not part of this POC."));
      check("the placeholder carries no filter bar", !html.includes("Locations"));
      // OR-1803. The live redemption rate above 100% is not reproduced in any
      // form, including struck through with a caveat.
      if (name.endsWith("loyalty-redemption")) {
        check("the known-bad redemption rate is not reproduced", !html.includes("118.6"));
      }
    }

    // ── §2 and §12: five items, no Customer Report, no sixth item ──────────
    //
    // Asserted on the hrefs rather than on the labels: "Coverage" and "Venues"
    // are ordinary words that appear in table headers and prose, and matching
    // them as text fails on pages that are perfectly correct.
    if (isReport) {
      check("the sidebar carries no Customer Report", !html.includes("Customer Report"));
      for (const retired of ["coverage", "members", "trade", "venues"]) {
        check(`no nav link points at the retired /${retired} route`,
          !new RegExp(`href="/[^"]+/${retired}"`).test(html));
      }
      for (const item of ["Overview", "Loyalty Spend", "Loyalty Redemption", "Behaviour", "Guests"]) {
        check(`the sidebar carries "${item}"`, html.includes(item));
      }
      // Exactly five links under Customers, and not a sixth.
      const navLinks = [...html.matchAll(/href="\/[^/"]+\/[^/"]+\/([a-z-]+)"/g)].map((m) => m[1]);
      const unique = [...new Set(navLinks)].sort();
      check("there is no sixth item in the section",
        unique.every((h) =>
          ["overview", "loyalty-spend", "loyalty-redemption", "behaviour", "guests"].includes(h)),
        `found ${unique.join(", ")}`);
    }

    // ── §7.3: the truncation confession is gone ────────────────────────────
    check("no timeline advertises itself as capped",
      !html.includes("the timeline is capped"));

    // ── §12: nothing exports, downloads, copies or sends ───────────────────
    check("nothing offers a download", !/<a[^>]+download/.test(html));
    check("nothing offers an export or CSV", !/>\s*(Export|Download CSV|Copy to clipboard)\s*</.test(html));
  }

  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures) {
    console.error("A display rule is being broken in the rendered output.");
    process.exit(1);
  }
  console.log("Every display rule holds in the built HTML.");
}

main();
