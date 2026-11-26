"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  ScaleControl,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./unit-map.css";

import {
  type CellSquare,
  type LatLon,
  cellPolygon,
  equirectangularMeters,
  gridCellPolygons,
  liesOnWashingtonDc,
  localOrigin,
  METERS_PER_DEGREE_LAT,
  metersPerDegreeLon,
  toDisplayLatLon,
  trainingAnchor,
} from "@/lib/interop/training-chart";
import { renderMilSymbolSvg } from "@/lib/interop/symbology";
import { parseMgrs } from "@/lib/tise/mgrs";
import type { Cluster, MgrsPoint, TiseEvent } from "@/lib/tise/types";

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SHORT_ROAD_METERS = 2_000;

type ChartSquare = {
  cell100m: string;
  polygon: LatLon[];
  occupied: boolean;
};

type ChartMarker = {
  id: string;
  position: LatLon;
  cluster: Cluster;
};

type ChartModel = {
  squares: ChartSquare[];
  markers: ChartMarker[];
  roads: Array<[LatLon, LatLon]>;
  focus: LatLon[];
};

function acceptPoint(point: LatLon): LatLon | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  if (liesOnWashingtonDc(point)) return null;
  return point;
}

function acceptPolygon(polygon: readonly LatLon[]): LatLon[] | null {
  const corners: LatLon[] = [];
  for (const corner of polygon) {
    const accepted = acceptPoint(corner);
    if (!accepted) return null;
    corners.push(accepted);
  }
  return corners;
}

function pushSquare(
  squares: ChartSquare[],
  seen: Set<string>,
  cell: CellSquare,
  occupied: ReadonlySet<string>,
) {
  if (seen.has(cell.cell100m)) return;
  const polygon = acceptPolygon(cell.polygon);
  if (!polygon) return;
  seen.add(cell.cell100m);
  squares.push({
    cell100m: cell.cell100m,
    polygon,
    occupied: occupied.has(cell.cell100m),
  });
}

function squaresForGroup(
  group: readonly MgrsPoint[],
  origin: LatLon,
  occupied: ReadonlySet<string>,
): ChartSquare[] {
  const reference = group[0];
  if (!reference) return [];
  let minE = reference.easting100m;
  let maxE = reference.easting100m;
  let minN = reference.northing100m;
  let maxN = reference.northing100m;
  for (const point of group) {
    minE = Math.min(minE, point.easting100m);
    maxE = Math.max(maxE, point.easting100m);
    minN = Math.min(minN, point.northing100m);
    maxN = Math.max(maxN, point.northing100m);
  }

  const squares: ChartSquare[] = [];
  const seen = new Set<string>();
  const grid = gridCellPolygons(reference, minE, maxE, minN, maxN, origin);
  if (grid.length > 0) {
    for (const cell of grid) pushSquare(squares, seen, cell, occupied);
    return squares;
  }

  for (const point of group) {
    pushSquare(
      squares,
      seen,
      {
        cell100m: point.cell100m,
        easting100m: point.easting100m,
        northing100m: point.northing100m,
        polygon: cellPolygon(point, origin),
      },
      occupied,
    );
  }
  return squares;
}

function findRoot(parent: number[], index: number): number {
  const at = parent[index];
  if (at === undefined || at === index) return index;
  const root = findRoot(parent, at);
  parent[index] = root;
  return root;
}

function spanningRoads(points: readonly LatLon[]): Array<[LatLon, LatLon]> {
  if (points.length < 2) return [];
  const edges: Array<{ left: number; right: number; weight: number }> = [];
  for (let i = 0; i < points.length; i += 1) {
    const from = points[i];
    if (!from) continue;
    for (let j = i + 1; j < points.length; j += 1) {
      const to = points[j];
      if (!to) continue;
      edges.push({ left: i, right: j, weight: equirectangularMeters(from, to) });
    }
  }
  edges.sort((a, b) => a.weight - b.weight);
  const parent = points.map((_, index) => index);
  const segments: Array<[LatLon, LatLon]> = [];
  for (const edge of edges) {
    const rootLeft = findRoot(parent, edge.left);
    const rootRight = findRoot(parent, edge.right);
    if (rootLeft === rootRight) continue;
    if (edge.weight > SHORT_ROAD_METERS) continue;
    parent[rootLeft] = rootRight;
    if (edge.weight < 1) continue;
    const from = points[edge.left];
    const to = points[edge.right];
    if (from && to) segments.push([from, to]);
  }
  return segments;
}

function buildChartModel(
  events: readonly TiseEvent[],
  clusters: readonly Cluster[],
): ChartModel {
  const located: MgrsPoint[] = [];
  for (const event of events) {
    const parsed = parseMgrs(event.location.mgrs);
    if (parsed) located.push(parsed);
  }

  const origin = localOrigin(
    located.length > 0 ? located : clusters.map((cluster) => cluster.centroid),
  );
  const occupied = new Set(located.map((point) => point.cell100m));
  const groups = new Map<string, MgrsPoint[]>();
  for (const point of located) {
    const key = `${point.gzd} ${point.square}`;
    const list = groups.get(key);
    if (list) list.push(point);
    else groups.set(key, [point]);
  }

  const squares = [...groups.values()].flatMap((group) =>
    squaresForGroup(group, origin, occupied),
  );

  const markers: ChartMarker[] = [];
  for (const cluster of clusters) {
    const position = acceptPoint(toDisplayLatLon(cluster.centroid, origin));
    if (!position) continue;
    markers.push({ id: cluster.id, position, cluster });
  }

  const roads = spanningRoads(markers.map((marker) => marker.position));
  const focus = [
    ...markers.map((marker) => marker.position),
    ...squares.flatMap((square) => square.polygon),
  ];
  return { squares, markers, roads, focus };
}

function sharesCluster(previous: string, next: string): boolean {
  const known = new Set(previous.split(",").filter((id) => id.length > 0));
  if (known.size === 0) return false;
  return next.split(",").some((id) => known.has(id));
}

function fitUnits(map: L.Map, points: readonly LatLon[], animate: boolean) {
  if (points.length === 0) {
    map.setView([trainingAnchor.lat, trainingAnchor.lon], 14, { animate });
    return;
  }
  const bounds = L.latLngBounds(
    points.map((point) => [point.lat, point.lon] as [number, number]),
  );
  const latPad = 160 / METERS_PER_DEGREE_LAT;
  const lonPad = 160 / metersPerDegreeLon(trainingAnchor.lat);
  bounds.extend([bounds.getSouth() - latPad, bounds.getWest() - lonPad]);
  bounds.extend([bounds.getNorth() + latPad, bounds.getEast() + lonPad]);
  map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17, animate });
}

function cellStyle(occupied: boolean, selected: boolean): L.PathOptions {
  if (selected) {
    return {
      color: "#fde68a",
      weight: 2,
      fillColor: "#3f2e0a",
      fillOpacity: 0.78,
    };
  }
  if (occupied) {
    return {
      color: "#f59e0b",
      weight: 1.4,
      fillColor: "#10202c",
      fillOpacity: 0.7,
    };
  }
  return {
    color: "#cbd5e1",
    weight: 1,
    fillColor: "#0c1924",
    fillOpacity: 0.34,
  };
}

function unitIcon(sidc: string, selected: boolean, noStrike: boolean): L.DivIcon {
  const svg = renderMilSymbolSvg(sidc, { size: 28 });
  const className = [
    "tise-unit-icon",
    selected ? "is-selected" : "",
    noStrike ? "is-no-strike" : "",
  ]
    .filter((token) => token.length > 0)
    .join(" ");
  return L.divIcon({
    className,
    html: `<div class="tise-unit-glyph">${svg}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -18],
  });
}

function selectedCellIds(
  clusters: readonly Cluster[],
  selectedClusterId: string | null,
): Set<string> {
  const cluster = clusters.find((item) => item.id === selectedClusterId);
  const ids = new Set<string>();
  if (!cluster) return ids;
  ids.add(cluster.cell100m);
  for (const event of cluster.events) {
    const parsed = parseMgrs(event.location.mgrs);
    if (parsed) ids.add(parsed.cell100m);
  }
  return ids;
}

function MapLifecycle({
  focus,
  signature,
}: {
  focus: readonly LatLon[];
  signature: string;
}) {
  const map = useMap();
  const fitted = useRef<string | null>(null);

  const syncView = useCallback(() => {
    const size = map.getSize();
    if (size.x < 20 || size.y < 20) return;
    if (fitted.current === signature) return;
    const previous = fitted.current;
    const shouldFit =
      previous === null ||
      previous.length === 0 ||
      signature.length === 0 ||
      !sharesCluster(previous, signature);
    fitted.current = signature;
    if (shouldFit) fitUnits(map, focus, false);
  }, [focus, map, signature]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize();
      syncView();
    });
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      syncView();
    });
    observer.observe(map.getContainer());
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map, syncView]);

  return null;
}

function UnitMarker({
  cluster,
  position,
  selected,
  onSelectCluster,
}: {
  cluster: Cluster;
  position: LatLon;
  selected: boolean;
  onSelectCluster: (id: string) => void;
}) {
  const icon = useMemo(
    () => unitIcon(cluster.sidc, selected, cluster.noStrike),
    [cluster.noStrike, cluster.sidc, selected],
  );
  const latLng = useMemo(
    () => [position.lat, position.lon] as [number, number],
    [position.lat, position.lon],
  );

  return (
    <Marker
      position={latLng}
      icon={icon}
      zIndexOffset={selected ? 900 : 0}
      eventHandlers={{
        click: () => onSelectCluster(cluster.id),
      }}
    >
      <Tooltip
        permanent
        direction="top"
        offset={[0, -20]}
        className="tise-site-label"
      >
        {cluster.siteLabel}
      </Tooltip>
      <Popup className="tise-unit-popup">
        <div className="min-w-36 space-y-0.5 font-mono text-[11px] text-zinc-100">
          <p className="font-semibold text-amber-100">{cluster.siteLabel}</p>
          <p>Veracity {cluster.veracity.toFixed(2)}</p>
          <p>Admiralty {cluster.admiraltyCode}</p>
          <p>
            Vectors{" "}
            {cluster.vectors.length > 0 ? cluster.vectors.join(", ") : "—"}
          </p>
          {cluster.noStrike ? (
            <p className="font-semibold text-cyan-300">No-strike</p>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}

export function UnitMap({
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
  const model = useMemo(
    () => buildChartModel(events, clusters),
    [events, clusters],
  );
  const signature = useMemo(
    () =>
      clusters
        .map((cluster) => cluster.id)
        .sort()
        .join(","),
    [clusters],
  );
  const selectedCells = useMemo(
    () => selectedCellIds(clusters, selectedClusterId),
    [clusters, selectedClusterId],
  );
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className="tise-map relative h-full min-h-0 w-full flex-1">
      <div className="absolute inset-0">
        <MapContainer
          ref={mapRef}
          center={[trainingAnchor.lat, trainingAnchor.lon]}
          zoom={16}
          minZoom={3}
          maxZoom={19}
          scrollWheelZoom
          zoomControl
          attributionControl
          className="h-full w-full outline-none"
          style={{
            height: "100%",
            width: "100%",
            background: "#9ec9e0",
          }}
        >
          <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILES} maxZoom={19} />
          {model.squares.map((square) => (
            <Polygon
              key={square.cell100m}
              positions={square.polygon.map(
                (corner) => [corner.lat, corner.lon] as [number, number],
              )}
              interactive={false}
              pathOptions={cellStyle(
                square.occupied,
                selectedCells.has(square.cell100m),
              )}
            />
          ))}
          {model.roads.map(([from, to]) => (
            <Polyline
              key={`casing-${from.lat.toFixed(5)},${from.lon.toFixed(5)}-${to.lat.toFixed(5)},${to.lon.toFixed(5)}`}
              positions={[
                [from.lat, from.lon],
                [to.lat, to.lon],
              ]}
              interactive={false}
              pathOptions={{
                color: "#4a4034",
                weight: 6,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          ))}
          {model.roads.map(([from, to]) => (
            <Polyline
              key={`surface-${from.lat.toFixed(5)},${from.lon.toFixed(5)}-${to.lat.toFixed(5)},${to.lon.toFixed(5)}`}
              positions={[
                [from.lat, from.lon],
                [to.lat, to.lon],
              ]}
              interactive={false}
              pathOptions={{
                color: "#e6d3a3",
                weight: 3,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          ))}
          {model.markers.map((marker) => (
            <UnitMarker
              key={marker.id}
              cluster={marker.cluster}
              position={marker.position}
              selected={marker.id === selectedClusterId}
              onSelectCluster={onSelectCluster}
            />
          ))}
          <ScaleControl position="bottomleft" metric imperial={false} />
          <MapLifecycle focus={model.focus} signature={signature} />
        </MapContainer>
      </div>
      <div className="pointer-events-none absolute top-2 right-2 z-[1100] flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            fitUnits(map, model.focus, true);
          }}
          className="pointer-events-auto rounded-sm border border-amber-300/60 bg-[#070b10]/90 px-2 py-1 font-mono text-[10px] tracking-wider text-amber-100 uppercase shadow-sm hover:bg-amber-200/15"
        >
          Fit units
        </button>
        <p className="rounded-sm bg-[#070b10]/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
          Layer: fictional chart on water
        </p>
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex h-5 items-center justify-center bg-[#070b10]/82 px-2 text-center font-mono text-[10px] tracking-wide text-amber-100">
        Training datum. Relative MGRS geometry. Not a real place.
      </p>
    </div>
  );
}
