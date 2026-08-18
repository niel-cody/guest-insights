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

/**
 * Organisation identities, for the cross-organisation disclosure check.
 *
 * Venue names are included because they are the other half of the leak: a
 * report that never says "Meat Flour Wine" but does say "Braeside" has still
 * told the reader who the other customer is.
 */
async function orgIdentities(): Promise<{ slug: string; name: string; venues: string[] }[]> {
  const DATA = join(import.meta.dirname, "..", "data");
  const out: { slug: string; name: string; venues: string[] }[] = [];
  for (const slug of await readdir(DATA, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    for (const period of await readdir(join(DATA, slug.name), { withFileTypes: true })) {
      if (!period.isDirectory()) continue;
      try {
        const org = JSON.parse(
          await readFile(join(DATA, slug.name, period.name, "org.json"), "utf8"),
        ) as { slug: string; name: string; venues: { name: string }[] };
        out.push({
          slug: org.slug,
          name: org.name,
          venues: org.venues.map((v) => v.name),
        });
        break;
      } catch {
        // No org.json in this directory; try the next period.
      }
    }
  }
  return out;
}

let ORGS: { slug: string; name: string; venues: string[] }[] = [];
/** So the skipped-venue note prints once per org rather than once per page. */
const ambiguousLogged = new Set<string>();

async function main() {
  ORGS = await orgIdentities();
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
    const isPlaceholder = /(loyalty-(spend|redemption)|team\/(staff-scorecard|attendance))$/.test(name);
    // The org and root routes are redirects with no chrome. Asserting a sidebar
    // on them would be asserting against a page that has no reader.
    const isReport =
      isOverview ||
      isPlaceholder ||
      /\/(behaviour|guests)$/.test(name) ||
      /\/team\/(people|performance|margin)$/.test(name);

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
      // opens the evidence, so the register is still one click from the page
      // that dropped the long version. A static span reading "5 checks pass" is
      // what v1 shipped, so the assertion is on the control, not on the words.
      //
      // **It is a button now, not a link, and that is the C-4 fix.** As a link
      // it pointed at `#checks`, whose host section had been deleted from this
      // page — so this assertion passed for several builds while the badge went
      // nowhere at all. Matching on `<a>` is precisely what let that through.
      // The general anchor-resolves check below is the half that would have
      // caught it, and it runs on every page rather than only this one.
      check("the check badge is still on Overview and opens the register",
        /<button[^>]*aria-expanded[^>]*>(?:(?!<\/button>)[\s\S])*checks (?:pass|failing)/.test(html),
        "the badge is absent or no longer opens the evidence");

      // ── The two findings are open, not folded ────────────────────────────
      //
      // `Disclosure` keeps its result line visible either way, so this is not a
      // correctness rule — it is the editorial one that replaced the trust
      // panel. A finding behind a click is a finding nobody reads.
      // "Where the change came from" is still a `Disclosure`, so its fold must
      // be open. The basket block stopped being one entirely (OV-9): it is the
      // most immediately actionable thing on the page and it was last on the
      // longest page in the build, so it moved up and became a plain card.
      // Asserting `<details open>` on it would now assert the old shape back.
      {
        const i = html.indexOf("Where the change came from");
        if (i >= 0) {
          check(`"Where the change came from" is open by default`,
            /<details[^>]*\sopen/.test(html.slice(i, i + 2000)),
            "it renders folded");
        }
      }
      {
        const heading = "What members and everyone else actually buy";
        const i = html.indexOf(heading);
        if (i >= 0) {
          const block = html.slice(i, i + 4000);
          // Not behind any fold at all — open or otherwise. A closed `<details>`
          // opening between the heading and the table would hide the finding,
          // which is the thing this rule has always been about.
          check(`"${heading}" is not behind a fold`,
            !/<details(?![^>]*\sopen)/.test(block),
            "a closed fold sits between the heading and the table");
          // And the finding itself is on the page, not only its title.
          check(`"${heading}" states its finding on the face`,
            /the rate everybody else does/.test(block),
            "the headline sentence is missing");
        }
      }
    }

    // ── The drawer pattern, and the rule that governs what may go in it ───
    //
    // Task 0 of the Build 5 review: five panels independently asked for their
    // explanatory prose to move behind a button, and the value of that is
    // entirely in it being **one** pattern rather than five. So the affordance
    // is asserted to exist and to be the same object everywhere — a trigger
    // that names itself, in a panel header.
    //
    // The rule the drawer exists under is asserted separately and negatively,
    // below: the sentences that change how a figure must be read stay on the
    // face. Those are the ones a roomy container invites an author to sweep
    // away, and each of them has a history of nearly being swept.
    if (isReport && !isPlaceholder) {
      const triggers = [...html.matchAll(/data-explain-drawer[^>]*/g)].map((m) => m[0]);
      if (triggers.length) {
        check("every explain drawer names itself for a screen reader",
          triggers.every((t) => /aria-label="[^"]+"/.test(t)),
          "a drawer trigger has no aria-label");
      }
    }

    if (isOverview) {
      // Overruled on 17 August and again in Build 5: the size of the selection
      // share may move into a tooltip, the fact of it may not. A screenshot of
      // a KPI card travels without its caption.
      //
      // Scoped to the tile that makes the claim. Where the within-person
      // estimate cannot be made — Meat Flour Wine — the tile refuses instead
      // and carries a longer statement in place of the figure, which is a
      // different and stronger caveat rather than a missing one.
      if (html.includes("A member is associated with")) {
        check("the selection caveat is on the face of the KPI row",
          html.includes("Association, not effect"),
          "the tile has stopped saying the gap is association");
      }
      // OV-6 reduced this block by moving the uplift band and its take-up
      // working into a drawer. What could not move with it is the label that
      // stops the trade at stake being read as uplift.
      check("the opportunity still says trade at stake is not uplift",
        html.includes("This is trade at stake, not uplift"),
        "the distinction has been dropped");
      // C-2: the exactness claim is now checkable, so it must also be stated
      // against the quantity it is actually true of.
      const g = html.indexOf("Where the change came from");
      if (g >= 0 && html.includes("Modelled change")) {
        check("the decomposition reconciles modelled against recorded revenue",
          /rounding in the\s*(?:<!-- -->)?\s*four stored factors|rounding in the four stored factors/.test(
            html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
          ),
          "the sum claim no longer says what the difference is");
      }
    }

    if (name.endsWith("/behaviour")) {
      // BH-7. The chart is liked precisely for the thing it does not prove, so
      // the correction cannot follow the method into the drawer.
      check("the retention refusal is still on the face",
        html.includes("What we cannot yet tell you"),
        "the refusal has moved behind a click");
      check("the burn-down still corrects the growth reading",
        html.replace(/<[^>]+>/g, "").includes("enrolment outrunning churn"),
        "the stack now reads as retention improving");
      // The clock-change banner is the reason the wall exists.
      check("the member-tier wall still declares the clock change",
        html.includes("runs on a different clock"),
        "the wall no longer says the population changed");
    }

    // ── No organisation's page names another organisation ─────────────────
    //
    // Passwords now go to two different merchants who compete in the same
    // market, so a page belonging to one must not disclose that the other is a
    // customer — let alone name their venues.
    //
    // This is asserted on the **prerendered HTML**, which is the only place it
    // could be checked, because that is where the leak was: the organisation
    // switcher rendered an `<option>` for every org in the dataset and hid the
    // wrong ones client-side, and the check register carried worked examples
    // naming a specific merchant. Neither leaked a figure. Both leaked a
    // customer list, which is its own kind of confidential and is the sort of
    // thing that ends a lighthouse relationship badly.
    //
    // Runs on the report pages only: the index and the org landing pages are
    // redirects with no content, and `/login` deliberately says nothing at all.
    if (isReport && !isPlaceholder) {
      const mine = name.split("/").filter(Boolean)[0];
      for (const other of ORGS.filter((o) => o.slug !== mine)) {
        /**
         * The organisation's name and slug are checked unconditionally. They
         * are unambiguous, and they are where both real leaks were.
         *
         * **Venue names are checked only when they are distinctive.** The guest
         * rows carry pseudonymised people, and a single-word suburb is also a
         * perfectly ordinary given name or surname: this check first fired on
         * "Casey", which is a Coffee Guru venue *and* the first name of three
         * Meat Flour Wine guests. Asserting on it would have been a permanent
         * false alarm, and a test that cries wolf gets deleted.
         *
         * The skipped names are logged rather than dropped quietly, because a
         * bounded check that does not say what it did not cover reads as
         * complete when it is not.
         */
        const distinctive = other.venues.filter((v) => v.trim().includes(" "));
        const ambiguous = other.venues.filter((v) => !v.trim().includes(" "));

        for (const needle of [other.name, other.slug, ...distinctive]) {
          if (!needle) continue;
          check(
            `does not name another organisation (${needle})`,
            !html.includes(needle),
            `"${needle}" appears in ${mine}'s prerendered HTML`,
          );
        }
        if (ambiguous.length && !ambiguousLogged.has(other.slug)) {
          ambiguousLogged.add(other.slug);
          console.log(
            `  · ${ambiguous.length} single-word venue names on ${other.slug} are not asserted ` +
              `(they collide with pseudonymised guest names): ${ambiguous.join(", ")}`,
          );
        }
      }
    }

    // ── Every in-page anchor resolves to something (C-4) ──────────────────
    //
    // The header chip read "27 checks pass · 1 to review" and linked to
    // `#checks`. Nothing on any page carried that id: the anchor's host section
    // had been removed from Overview and was rendered nowhere at all. The badge
    // was the first thing a technical buyer clicks, it is the build's own claim
    // to rigour, and it went nowhere for several builds — while a layout test
    // asserting the badge "is a link" passed the whole time.
    //
    // A claim that cannot be opened is a claim. This asserts the general rule
    // rather than the one instance, because the specific failure was not that
    // *this* anchor broke — it was that nothing was watching any of them.
    {
      const targets = new Set(
        [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
      );
      const dead = [...html.matchAll(/href="#([^"]+)"/g)]
        .map((m) => m[1])
        .filter((t) => t !== "" && t !== "top" && !targets.has(t));
      check("every in-page anchor resolves to an element on the page",
        dead.length === 0,
        dead.length ? `${[...new Set(dead)].map((d) => `#${d}`).join(", ")} points at nothing` : "");
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

    // ── R-217 · member.tierScopeDeclared ───────────────────────────────────
    //
    // Every figure below the member-tier wall names its scope in its own
    // heading. Coverage there is roughly 19% of orders and the population is
    // heavily self-selected — this build's own analysis puts about 97% of the
    // member value gap down to selection rather than effect. A chart that loses
    // "members only" from its title launders that sample into a general one, on
    // the product built to prevent exactly that.
    //
    // This was specified in the build pack, asserted live in a doc comment, and
    // never actually written. Asserted on the built HTML rather than on the
    // source, because the heading is what a reader meets — and a screenshot of
    // a chart travels without the wall it sat behind.
    {
      const wall = html.indexOf("data-member-tier");
      if (wall >= 0) {
        // Figures are not nested here, so each one runs to the next </figure>.
        const section = html.slice(wall);
        const end = section.indexOf("</section>");
        const scoped = end > 0 ? section.slice(0, end) : section;

        let from = 0;
        let figures = 0;
        for (;;) {
          const open = scoped.indexOf("<figure", from);
          if (open < 0) break;
          const close = scoped.indexOf("</figure>", open);
          const fig = between(scoped, open, close > 0 ? close : scoped.length);
          figures++;
          const heading = /<h[34][^>]*>([\s\S]*?)<\/h[34]>/.exec(fig);
          const text = (heading?.[1] ?? "").replace(/<[^>]+>/g, " ");
          check(
            "a member-tier figure declares its tier in its own heading",
            /members only/i.test(text),
            `"${text.trim().slice(0, 60)}" is below the member wall and does not say so`,
          );
          from = close > 0 ? close + 9 : open + 7;
        }
        // A wall with no figures behind it would pass the loop vacuously, which
        // is the way this check would quietly stop testing anything.
        check("the member-tier wall still has figures behind it", figures > 0,
          "no <figure> found below data-member-tier");
      }
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
      for (const item of [
        "Overview", "Loyalty Spend", "Loyalty Redemption", "Behaviour", "Guests",
        "People", "Performance", "Margin", "Staff Scorecard", "Attendance",
      ]) {
        check(`the sidebar carries "${item}"`, html.includes(item));
      }

      /**
       * The group is called Team, and the word Staff survives in exactly one
       * place: the name of the production report that is actually called Staff
       * Scorecard.
       *
       * This is asserted because the rename is the kind of change that gets
       * half-done — a group header updated and a heading left behind, or the
       * reverse — and the half-done state reads as a product that has not
       * decided what it calls its people.
       */
      const navBlock = between(html, html.indexOf("Operations"), html.indexOf("Customers"));
      check("the section is called Team, not Staff",
        navBlock.includes("Team") && !/>\s*Staff\s*</.test(navBlock),
        "a nav group still reads Staff");

      /**
       * Every nav item resolves to a route the build actually produced.
       *
       * The old assertion listed the five Customers items and rejected a sixth,
       * which was right until there was a second section — at which point it
       * would have rejected the Team routes as intruders. Enumerating a fixed
       * list is a test that has to be edited every time the product grows, and a
       * test edited under pressure to make it pass stops being a test. This
       * asserts the property that actually matters instead: **no nav item points
       * somewhere the build did not render.**
       */
      const navLinks = [...html.matchAll(/href="\/[^/"]+\/[^/"]+\/([a-z-]+(?:\/[a-z-]+)?)"/g)]
        .map((m) => m[1]);
      const unique = [...new Set(navLinks)].sort();
      const known = [
        "overview", "behaviour", "guests", "loyalty-spend", "loyalty-redemption",
        "team/people", "team/performance", "team/margin",
        "team/staff-scorecard", "team/attendance",
      ];
      const strays = unique.filter((h) => !known.includes(h));
      check("every nav item points at a route this build renders", strays.length === 0,
        `found ${strays.join(", ")}`);
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
