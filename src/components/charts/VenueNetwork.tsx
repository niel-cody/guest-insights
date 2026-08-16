"use client";

import { useMemo, useState } from "react";
import { count, money, pct } from "@/lib/metrics";
import type { Network, NetworkEdge, NetworkNode } from "@/lib/types";
import { Tooltip, useTooltip, TipRow } from "./chart-kit";

/**
 * The venue network, drawn on real geography.
 *
 * **Nodes sit at their true coordinates.** A force-directed layout would invent a
 * spatial arrangement that competes with the real one — and given that distance
 * explains most of the variance in co-visitation here, it would largely reproduce
 * the map anyway, but wrongly, and without the reader being able to tell which
 * parts were measured and which were the physics of the simulation. Placing nodes
 * geographically means every edge that looks long *is* long, and the long edges
 * are the finding.
 *
 * **The map is faceted by region, not fitted to the whole estate.** Coffee Guru
 * trades across three states; a single frame containing Kedron and Lanyon puts
 * fourteen Canberra venues inside four pixels of each other. Venues are clustered
 * by proximity and each cluster gets its own panel at its own scale, so the dense
 * catchment is legible and the isolated venues are still on the page.
 *
 * **There is no basemap.** A coastline would have to be fetched — the app makes no
 * network calls by design — or drawn from memory, and an approximated coastline is
 * fabricated geography sitting underneath measured points. A scale bar carries the
 * same information and claims nothing that is not in the data.
 */

type Placed = NetworkNode & { lat: number; lon: number };

const PAD = { top: 26, right: 26, bottom: 40, left: 26 };
const EARTH_KM = 111.32;

function distanceKm(a: Placed, b: Placed): number {
  const midLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dy = (a.lat - b.lat) * EARTH_KM;
  const dx = (a.lon - b.lon) * EARTH_KM * Math.cos(midLat);
  return Math.hypot(dx, dy);
}

/** Single-linkage clustering: venues within `thresholdKm` of each other share a frame. */
function clusterByProximity(nodes: Placed[], thresholdKm: number): Placed[][] {
  const parent = nodes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (distanceKm(nodes[i], nodes[j]) <= thresholdKm) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Placed[]>();
  nodes.forEach((n, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), n]);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

export function VenueNetwork({ network, clusterKm = 60 }: { network: Network; clusterKm?: number }) {
  const { tip, show, hide, ref } = useTooltip();
  const [minResidual, setMinResidual] = useState(1);

  const placed = useMemo(
    () => network.nodes.filter((n): n is Placed => n.lat != null && n.lon != null),
    [network.nodes],
  );
  const clusters = useMemo(() => clusterByProximity(placed, clusterKm), [placed, clusterKm]);

  const drawn = useMemo(
    () => network.edges.filter((e) => e.residual != null && e.residual >= minResidual),
    [network.edges, minResidual],
  );
  const maxResidual = Math.max(...network.edges.map((e) => e.residual ?? 0), 1.01);
  const maxPeople = Math.max(...network.nodes.map((n) => n.people), 1);

  if (placed.length < 2) {
    return <p className="text-[13px] text-ink-secondary">Not enough geocoded venues to draw a map.</p>;
  }

  // A cluster earns a panel if it holds more than one venue. Lone venues are
  // named underneath rather than given a frame with a single dot in it.
  const panels = clusters.filter((c) => c.length > 1);
  const singles = clusters.filter((c) => c.length === 1).flat();
  // Whether an isolated venue has any measurable link is a fact about the data,
  // not a safe assumption about geography.
  const singleIds = new Set(singles.map((s) => s.id));
  const singleEdges = network.edges.filter(
    (e) => e.residual != null && (singleIds.has(e.a) || singleIds.has(e.b)),
  ).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[12px] text-ink-secondary">
          Show links above
          <input
            type="range" min={1} max={Math.max(2, Math.ceil(maxResidual * 10) / 10)} step={0.1}
            value={minResidual}
            onChange={(e) => setMinResidual(Number(e.target.value))}
            className="accent-[var(--accent)]"
            aria-label="Minimum times the pair beats its predicted distance decay"
          />
          <span className="tnum font-medium text-ink">{minResidual.toFixed(1)}×</span>
          <span>what distance predicts</span>
        </label>
        <span className="text-[12px] text-ink-muted">
          {drawn.length} of {network.edges.length} measured pairs drawn
        </span>
      </div>

      <div ref={ref} className="relative">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          {panels.map((cluster, i) => (
            <RegionPanel
              key={cluster[0].id}
              nodes={cluster}
              edges={drawn}
              maxResidual={maxResidual}
              maxPeople={maxPeople}
              height={i === 0 ? 420 : 200}
              className={i === 0 ? "lg:row-span-2" : undefined}
              show={show}
              hide={hide}
            />
          ))}
        </div>
        <Tooltip tip={tip} width={900} />
      </div>

      {singles.length > 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
          <span className="font-medium text-ink-secondary">Also trading, too far from any other venue to
          share a frame:</span>{" "}
          {singles.map((s) => s.name).join(", ")}. Each is more than {clusterKm} km from its nearest
          sibling{singleEdges === 0
            ? ", and none shares enough guests with another venue to draw a line"
            : `, and ${singleEdges === 1 ? "one carries a link" : `${singleEdges} carry links`} to venues in another frame`}.
        </p>
      )}

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-secondary">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: "var(--tier-member)", opacity: 0.45 }} />
          Circle size is people identified · shade is member share of revenue
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" y1="3" x2="20" y2="3" stroke="var(--accent)" strokeWidth="3" strokeOpacity="0.4" />
          </svg>
          Thickness is how far the pair beats its distance
        </li>
        <li>Each panel has its own scale.</li>
      </ul>
    </div>
  );
}

function RegionPanel({
  nodes, edges, maxResidual, maxPeople, height, className, show, hide,
}: {
  nodes: Placed[];
  edges: NetworkEdge[];
  maxResidual: number;
  maxPeople: number;
  height: number;
  className?: string;
  show: (e: React.MouseEvent, content: React.ReactNode) => void;
  hide: () => void;
}) {
  const width = 560;
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const mine = edges.filter((e) => ids.has(e.a) && ids.has(e.b));

  const lats = nodes.map((n) => n.lat);
  const lons = nodes.map((n) => n.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);

  // A little padding in degrees so labels are not clipped at the frame edge.
  const padDeg = Math.max((maxLat - minLat) * 0.14, (maxLon - minLon) * 0.14, 0.004);
  const spanX = Math.max((maxLon - minLon + padDeg * 2) * kx, 1e-6);
  const spanY = Math.max(maxLat - minLat + padDeg * 2, 1e-6);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const scale = Math.min(plotW / spanX, plotH / spanY);
  const offX = PAD.left + (plotW - spanX * scale) / 2;
  const offY = PAD.top + (plotH - spanY * scale) / 2;

  const x = (lon: number) => offX + (lon - minLon + padDeg) * kx * scale;
  const y = (lat: number) => offY + (maxLat + padDeg - lat) * scale;
  const pxPerKm = scale / EARTH_KM;
  const scaleKm = niceScaleKm(pxPerKm, plotW);
  const radius = (n: Placed) => 4 + 15 * Math.sqrt(n.people / maxPeople);

  // Name the region after its largest venue rather than inventing a district name.
  const ranked = [...nodes].sort((a, b) => b.people - a.people);
  const anchor = ranked[0];

  // Labels are placed largest venue first and a label is dropped when its box
  // would collide with one already placed. A dense catchment is the case this
  // surface exists for, and overlapping text is how a map of one stops being
  // readable — the venue is still a circle, still hoverable, still in the table
  // below. Better to name twelve of thirteen than to stack all thirteen.
  const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelled = ranked.map((n) => {
    const r = radius(n);
    const w = n.name.length * 5.4 + 4;
    const cx = x(n.lon);
    const cy = y(n.lat) - r - 4;
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - 9, y1: cy + 2 };
    const hits = taken.some((t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0);
    if (!hits) taken.push(box);
    return { n, showLabel: !hits };
  });
  const unlabelled = labelled.filter((l) => !l.showLabel).length;

  return (
    <div className={`rounded-lg border border-line bg-surface-sunken ${className ?? ""}`}>
      <p className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2 text-[12px] font-medium text-ink-secondary">
        <span>{nodes.length} venues around {anchor.name}</span>
        {unlabelled > 0 && (
          <span className="font-normal text-ink-muted">{unlabelled} unlabelled — hover to name</span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${nodes.length} venues near ${anchor.name} at their true coordinates, joined where they share more guests than distance predicts`}
      >
        {mine.map((e) => {
          const a = byId.get(e.a)!, b = byId.get(e.b)!;
          const w = 1 + 4 * ((e.residual! - 1) / Math.max(maxResidual - 1, 0.01));
          return (
            <line
              key={`${e.a}|${e.b}`}
              x1={x(a.lon)} y1={y(a.lat)} x2={x(b.lon)} y2={y(b.lat)}
              stroke="var(--accent)" strokeWidth={w} strokeOpacity={0.4} strokeLinecap="round"
              onMouseEnter={(ev) => show(ev, <EdgeTip e={e} aName={a.name} bName={b.name} />)}
              onMouseLeave={hide}
            />
          );
        })}

        {labelled.map(({ n, showLabel }) => {
          const r = radius(n);
          return (
            <g key={n.id} onMouseEnter={(ev) => show(ev, <NodeTip n={n} />)} onMouseLeave={hide}>
              <circle
                cx={x(n.lon)} cy={y(n.lat)} r={r}
                fill="var(--tier-member)"
                fillOpacity={Math.min(0.18 + n.memberShare * 3.2, 0.92)}
                stroke="var(--surface-raised)" strokeWidth={1.5}
              />
              {showLabel && (
                <text
                  x={x(n.lon)} y={y(n.lat) - r - 4}
                  textAnchor="middle" fontSize={10.5} fill="var(--ink-secondary)"
                  stroke="var(--surface-sunken)" strokeWidth={3} paintOrder="stroke"
                >
                  {n.name}
                </text>
              )}
            </g>
          );
        })}

        <g transform={`translate(${PAD.left}, ${height - 16})`}>
          <line x1={0} x2={scaleKm * pxPerKm} y1={0} y2={0} stroke="var(--ink-muted)" strokeWidth={1.5} />
          <line x1={0} x2={0} y1={-4} y2={4} stroke="var(--ink-muted)" strokeWidth={1.5} />
          <line
            x1={scaleKm * pxPerKm} x2={scaleKm * pxPerKm} y1={-4} y2={4}
            stroke="var(--ink-muted)" strokeWidth={1.5}
          />
          <text x={scaleKm * pxPerKm + 6} y={4} fontSize={10.5} fill="var(--ink-muted)">
            {scaleKm} km
          </text>
        </g>
      </svg>
    </div>
  );
}

function NodeTip({ n }: { n: NetworkNode }) {
  return (
    <div className="min-w-[190px]">
      <p className="mb-1 font-medium text-ink">{n.name}</p>
      <TipRow label="People identified" value={count(n.people)} />
      <TipRow label="Revenue" value={money(n.revenue)} />
      <TipRow label="Member share" value={pct(n.memberShare, 1)} />
    </div>
  );
}

function EdgeTip({ e, aName, bName }: { e: NetworkEdge; aName: string; bName: string }) {
  return (
    <div className="min-w-[220px]">
      <p className="mb-1 font-medium text-ink">{aName} – {bName}</p>
      <TipRow label="Guests at both" value={count(e.shared)} />
      <TipRow label="Expected if unrelated" value={count(e.expected)} />
      <TipRow label="Apart" value={`${e.km?.toFixed(1)} km`} />
      <div className="mt-1 border-t border-line pt-1">
        <TipRow label="Beats its distance by" value={e.residual ? `${e.residual.toFixed(1)}×` : "—"} />
      </div>
    </div>
  );
}

/** A round number of kilometres filling a sensible share of the plot. */
function niceScaleKm(pxPerKm: number, plotWidth: number): number {
  const raw = (plotWidth * 0.22) / pxPerKm;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
}
