import type { Brief, NamedList } from "@/lib/metrics";
import { dayLabel, habit } from "@/lib/metrics";
import type { Org } from "@/lib/types";

/**
 * The printed staff sheet — R-135, promoted to MVP on the Chair's ruling.
 *
 * Five names, one fact each, on paper, on the pass. In-venue recognition is where
 * hospitality value actually lands, and it is the card tier's only action: you
 * cannot email a card, but you can recognise the person holding it.
 *
 * Hidden on screen, laid out for A4 at print.
 */
export function PrintSheet({
  org, brief, lists,
}: {
  org: Org;
  brief: Brief;
  lists: NamedList[];
}) {
  const slipping = lists.find((l) => l.key === "slipping");
  const unknown = lists.find((l) => l.key === "unknown-regulars");

  return (
    <div className="hidden print:block print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .sheet { color: #000; font-size: 12pt; }
          .sheet h1 { font-size: 20pt; }
        }
      `}</style>

      <div className="sheet">
        <header style={{ borderBottom: "2px solid #000", paddingBottom: "6pt" }}>
          <h1 style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
            {org.name} — today&rsquo;s five
          </h1>
          <p style={{ marginTop: "3pt" }}>
            {dayLabel(org.window.end)} · put this on the pass
          </p>
        </header>

        {brief.silent ? (
          <p style={{ marginTop: "18pt", fontSize: "14pt" }}>
            Nobody to chase today. Nothing has slipped since the last sheet.
          </p>
        ) : (
          <ol style={{ marginTop: "14pt", listStyle: "none", padding: 0 }}>
            {brief.names.map((n, i) => (
              <li
                key={n.name}
                style={{ display: "flex", gap: "10pt", padding: "9pt 0", borderBottom: "1px solid #bbb" }}
              >
                <span style={{ fontWeight: 700, fontSize: "16pt", width: "18pt" }}>{i + 1}</span>
                <span>
                  <span style={{ fontWeight: 700, fontSize: "15pt" }}>{n.name}</span>
                  <br />
                  <span>{n.fact}</span>
                </span>
                <span style={{ marginLeft: "auto", fontSize: "10pt", color: "#444" }}>
                  spoke to them ☐
                </span>
              </li>
            ))}
          </ol>
        )}

        {unknown && unknown.guests.length > 0 && (
          <section style={{ marginTop: "16pt" }}>
            <h2 style={{ fontWeight: 700, fontSize: "13pt" }}>
              Regulars who have never joined ({unknown.total})
            </h2>
            <p style={{ fontSize: "10.5pt", color: "#444", marginTop: "2pt" }}>
              If you recognise one of these on the machine, ask them to join.
            </p>
            <ul style={{ marginTop: "6pt", paddingLeft: "14pt" }}>
              {unknown.guests.slice(0, 5).map((g) => (
                <li key={g.id} style={{ padding: "2pt 0" }}>
                  {g.name} — {g.visits} {org.labels.visits} at {g.homeStore}, {habit(g, org)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer style={{ marginTop: "18pt", fontSize: "9.5pt", color: "#555", borderTop: "1px solid #bbb", paddingTop: "6pt" }}>
          {slipping ? `${slipping.total} regulars have slipped past their usual gap. ` : ""}
          Names are generated for this preview; the live sheet carries the guest&rsquo;s
          own name. Oolio Insights · Guests.
        </footer>
      </div>
    </div>
  );
}
