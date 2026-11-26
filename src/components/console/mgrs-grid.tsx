"use client";

import { cn } from "cn";

import { renderMilSymbolSvg } from "@/lib/interop/symbology";
import { landmarkLabel } from "@/lib/tise/lexicon";
import { parseMgrs } from "@/lib/tise/mgrs";
import type { Cluster, TiseEvent, VectorType } from "@/lib/tise/types";

const CELL = 10;

export function MgrsGrid({
  events,
  clusters,
  selectedClusterId,
  onSelectCluster,
}: {
  events: TiseEvent[];
  clusters: Cluster[];
  selectedClusterId: string | null;
  onSelectCluster: (id: string) => void;
}) {
  const aoi = clusters[0]?.cell1km ?? "18S UJ 23 06";
  const origin = originFromAoi(aoi);

  const cells = new Map<
    string,
    { e: number; n: number; events: TiseEvent[]; cluster?: Cluster }
  >();

  for (const event of events) {
    const parsed = parseMgrs(event.location.mgrs);
    if (!parsed) continue;
    const e = parsed.easting100m - origin.e;
    const n = parsed.northing100m - origin.n;
    if (e < 0 || n < 0 || e >= CELL || n >= CELL) continue;
    const key = `${e}:${n}`;
    const current = cells.get(key) ?? { e, n, events: [] };
    current.events.push(event);
    cells.set(key, current);
  }

  for (const cluster of clusters) {
    const e = Math.round(cluster.centroid.easting100m) - origin.e;
    const n = Math.round(cluster.centroid.northing100m) - origin.n;
    if (e < 0 || n < 0 || e >= CELL || n >= CELL) continue;
    const key = `${e}:${n}`;
    const current = cells.get(key) ?? { e, n, events: cluster.events };
    current.cluster = cluster;
    cells.set(key, current);
  }

  return (
    <div className="flex h-full min-h-[280px] flex-col gap-2 p-3">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
        <span>100m cells · {aoi}</span>
        <span>N up</span>
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          className="grid size-full gap-px bg-[#071018] p-px"
          style={{
            gridTemplateColumns: `repeat(${CELL}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${CELL}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: CELL * CELL }, (_, index) => {
            const e = index % CELL;
            const n = CELL - 1 - Math.floor(index / CELL);
            const cell = cells.get(`${e}:${n}`);
            const cluster = cell?.cluster;
            const density = cell?.events.length ?? 0;
            const selected = cluster && cluster.id === selectedClusterId;
            return (
              <button
                key={`${e}-${n}`}
                type="button"
                disabled={!cluster}
                onClick={() => cluster && onSelectCluster(cluster.id)}
                className={cn(
                  "relative min-h-[18px] border border-cyan-900/40",
                  density === 0 && "bg-[#0a1620]",
                  density === 1 && "bg-cyan-950/80",
                  density === 2 && "bg-amber-950",
                  density >= 3 && "bg-red-950",
                  selected && "ring-2 ring-amber-300 ring-offset-1 ring-offset-[#071018]",
                  cluster?.hot && "outline outline-1 outline-amber-400/50",
                )}
                title={
                  cluster
                    ? `${cluster.id} ${landmarkLabel(cluster.landmark)} v=${cluster.veracity.toFixed(2)}`
                    : `${aoi} +${e}/+${n}`
                }
              >
                {cluster ? (
                  <span
                    className="mx-auto block size-4 [&>svg]:size-4"
                    dangerouslySetInnerHTML={{
                      __html: renderMilSymbolSvg(cluster.sidc, { size: 18 }),
                    }}
                  />
                ) : density > 0 ? (
                  <span className="absolute inset-0 flex items-center justify-center gap-0.5">
                    {uniqueVectors(cell?.events ?? []).map((vector) => (
                      <span
                        key={vector}
                        className={cn(
                          "size-1.5 rounded-full",
                          vector === "SIGINT" && "bg-cyan-400",
                          vector === "HUMINT" && "bg-violet-400",
                          vector === "GEOINT" && "bg-lime-400",
                        )}
                      />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
        {clusters.map((cluster) => (
          <li key={cluster.id}>
            <button
              type="button"
              onClick={() => onSelectCluster(cluster.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 text-left hover:text-amber-200",
                selectedClusterId === cluster.id && "text-amber-200",
              )}
            >
              <span>
                {cluster.id} {landmarkLabel(cluster.landmark)}
                {cluster.hot ? " · HOT" : ""}
              </span>
              <span>v={cluster.veracity.toFixed(2)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function originFromAoi(aoi: string): { e: number; n: number } {
  const match = /(\d{2})\s+(\d{2})$/.exec(aoi);
  if (!match) return { e: 230, n: 60 };
  return {
    e: Number.parseInt(match[1] ?? "23", 10) * 10,
    n: Number.parseInt(match[2] ?? "06", 10) * 10,
  };
}

function uniqueVectors(events: TiseEvent[]): VectorType[] {
  return [...new Set(events.map((event) => event.vector_type))];
}
