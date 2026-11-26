"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { IngestDock } from "@/components/console/ingest-dock";
import { LowerDeck } from "@/components/console/lower-deck";
import { MgrsGrid } from "@/components/console/mgrs-grid";
import { Panel } from "@/components/console/panel";
import { SignalStream } from "@/components/console/signal-stream";
import { SitrepPanel } from "@/components/console/sitrep-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { renderMilSymbolSvg } from "@/lib/interop/symbology";
import {
  getScenario,
  scenarioEvents,
  SCENARIOS,
  type ScenarioId,
} from "@/lib/scenario/catalog";
import { adaptInbound } from "@/lib/synactic/adapter";
import { formatZulu, threatTone } from "@/lib/tise/format";
import { ingestAndSynthesize } from "@/lib/tise";
import type { Posture, SynthesisResult, TiseEvent } from "@/lib/tise/types";
import { cn } from "cn";

const PLAY_MS = 700;

type Deck = "friction" | "ach";
type MapSurface = "chart" | "cells";

function ChartFallback() {
  return (
    <div className="flex h-full min-h-[280px] flex-1 items-center justify-center font-mono text-[10px] tracking-[0.18em] text-zinc-500 uppercase">
      Loading chart
    </div>
  );
}

// Leaflet touches `window`. Load the chart only in the browser.
const UnitMap = dynamic(
  () => import("@/components/console/unit-map").then((module) => module.UnitMap),
  { ssr: false, loading: () => <ChartFallback /> },
);

function bootDistrictSeven() {
  const now = new Date();
  return { now, events: scenarioEvents("district-seven", now) };
}

export function TiseConsole() {
  const [boot] = useState(bootDistrictSeven);
  const [clock, setClock] = useState(() => boot.now);
  const [scenarioId, setScenarioId] = useState<ScenarioId>("district-seven");
  const [engineNow, setEngineNow] = useState(() => boot.now);
  const [source, setSource] = useState<unknown[]>(() => boot.events);
  const [cursor, setCursor] = useState(() => boot.events.length);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(true);
  const [quarantine, setQuarantine] = useState<string[]>([]);
  const [deck, setDeck] = useState<Deck>("friction");
  const [surface, setSurface] = useState<MapSurface>("chart");
  const [lineageOpen, setLineageOpen] = useState(false);
  const [cotOpen, setCotOpen] = useState(false);
  const [cotText, setCotText] = useState("");
  const [cotNote, setCotNote] = useState("");
  const [priorPosture, setPriorPosture] = useState<Posture | null>(null);
  const [synactic, setSynactic] = useState({
    configured: false,
    reason: "Checking Synactic link…",
  });

  const scenario = getScenario(scenarioId);
  const streaming = playing && cursor < source.length;

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void fetch("/api/synactic")
      .then((response) => response.json())
      .then((payload: { configured?: boolean; reason?: string }) => {
        setSynactic({
          configured: Boolean(payload.configured),
          reason: payload.reason ?? "Synactic status unknown.",
        });
      })
      .catch(() => {
        setSynactic({
          configured: false,
          reason: "Could not read Synactic status.",
        });
      });
  }, []);

  useEffect(() => {
    if (!streaming) return;
    const id = window.setTimeout(() => setCursor((value) => value + 1), PLAY_MS);
    return () => window.clearTimeout(id);
  }, [streaming, cursor]);

  const visible = source.slice(0, cursor);
  const result = useMemo(
    () =>
      visible.length === 0
        ? null
        : ingestAndSynthesize(visible, {
            now: engineNow,
            quarantinedEventIds: quarantine,
          }),
    [visible, engineNow, quarantine],
  );

  function loadScenario(id: ScenarioId, animate: boolean) {
    const now = new Date();
    const events = scenarioEvents(id, now);
    setScenarioId(id);
    setEngineNow(now);
    setSource(events);
    setQuarantine([]);
    setPriorPosture(null);
    setError(null);
    setSelectedId(null);
    setIsSample(true);
    if (animate) {
      setCursor(0);
      setPlaying(true);
    } else {
      setPlaying(false);
      setCursor(events.length);
    }
  }

  function toggleQuarantine(eventId: string) {
    setPriorPosture(result?.sitrep.recommendedPosture ?? null);
    setQuarantine((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId],
    );
  }

  function onPaste(raw: string) {
    try {
      const parsed: unknown = JSON.parse(raw);
      const adapted = adaptInbound(parsed);
      const now = new Date();
      const synthesis = ingestAndSynthesize(adapted, { now });
      setEngineNow(now);
      setSource(Array.isArray(adapted) ? adapted : [adapted]);
      setCursor(synthesis.accepted.length);
      setPlaying(false);
      setIsSample(false);
      setQuarantine([]);
      setError(
        synthesis.rejected.length > 0
          ? `${synthesis.rejected.length} event(s) rejected at the gate.`
          : null,
      );
    } catch {
      setError("Paste is not valid JSON.");
    }
  }

  async function onSynactic() {
    setError(null);
    const response = await fetch("/api/synactic", { method: "POST" });
    const payload = (await response.json()) as {
      error?: string;
      synthesis?: SynthesisResult;
    };
    if (!response.ok || !payload.synthesis) {
      setError(payload.error ?? "Synactic pull failed.");
      return;
    }
    setEngineNow(new Date(payload.synthesis.asOf));
    setSource(payload.synthesis.accepted);
    setCursor(payload.synthesis.accepted.length);
    setPlaying(false);
    setIsSample(false);
    setQuarantine([]);
  }

  async function exportCot(mode: "awareness" | "nomination") {
    setCotNote("");
    const response = await fetch("/api/export/cot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: visible, mode }),
    });
    const payload = (await response.json()) as {
      xml?: string;
      error?: string;
      policy?: { message?: string };
    };
    if (!response.ok) {
      setCotText("");
      setCotNote(payload.error ?? payload.policy?.message ?? "Export refused.");
      setCotOpen(true);
      return;
    }
    setCotText(payload.xml ?? "");
    setCotNote(
      mode === "nomination"
        ? "Nomination exported. A commander grant was not required for this response, which should not happen."
        : "Awareness CoT. Strike nomination stays behind a human grant.",
    );
    setCotOpen(true);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (event.key === "1") loadScenario("district-seven", false);
      if (event.key === "2") loadScenario("corridor-mirage", false);
      if (event.key === "3") loadScenario("iron-anvil", false);
      if (event.key === "4") loadScenario("blackout-ddil", false);
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((value) => !value);
      }
      if (event.key === "l" || event.key === "L") setLineageOpen(true);
      if (event.key === "m" || event.key === "M") setDeck("ach");
      if (event.key === "c" || event.key === "C") {
        void exportCot("awareness");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const threat = result?.sitrep.threatSurface.threatLevel ?? "LOW";
  const posture = result?.sitrep.recommendedPosture ?? "HOLD";
  const acceptedEvents: TiseEvent[] = result?.accepted ?? [];
  const grades = Object.fromEntries(
    (result?.enrichedEvents ?? []).map((event) => [
      event.event_id,
      {
        code: event.admiralty.code,
        falsity: event.deception?.falsityScore ?? 0,
        whaley: event.deception?.whaleyClass ?? "NONE",
        quarantined: event.quarantined,
      },
    ]),
  );
  const activeCluster =
    result?.clusters.find((cluster) => cluster.id === selectedCluster) ??
    result?.clusters[0];
  const lineageObjects =
    result?.ontology.objects.filter(
      (object) => !activeCluster || object.siteKey === activeCluster.siteKey,
    ) ?? [];
  const plottedEvents = (result?.accepted ?? []).filter(
    (event) =>
      !result?.discardedNoise.some(
        (noise) => noise.event_id === event.event_id,
      ) && !quarantine.includes(event.event_id),
  );

  function selectCluster(id: string) {
    setSelectedCluster(id);
    setLineageOpen(true);
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#070b10] text-zinc-100 max-lg:h-auto max-lg:min-h-dvh max-lg:overflow-visible">
      <div className="bg-amber-400 px-3 py-1 text-center font-mono text-[10px] font-semibold tracking-[0.22em] text-black uppercase">
        Training instrument · Fictional AOI · Not for operational use
      </div>
      <header
        className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden border-b border-white/10 bg-[#0b1016] px-3 py-1.5"
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-12 shrink-0 bg-contain bg-center bg-no-repeat drop-shadow-[0_0_12px_rgba(245,158,11,0.35)]"
            style={{ backgroundImage: "url(/brand/tise-mark.png)" }}
          />
          <div>
            <p className="font-mono text-[10px] tracking-[0.28em] text-cyan-300/80">
              TISE-v1 · {scenario.name}
            </p>
            <h1 className="text-base font-semibold tracking-tight">
              Tactical Intelligence Synthesis Engine
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => loadScenario(item.id, false)}
              className={cn(
                "rounded-sm border px-1.5 py-1",
                item.id === scenarioId
                  ? "border-amber-300 text-amber-100"
                  : "border-white/10 text-zinc-400",
              )}
            >
              {item.hotkey} {item.name}
            </button>
          ))}
          <span className="rounded-sm border border-white/15 px-2 py-1">
            {formatZulu(clock)}
          </span>
          <span className={cn("rounded-sm border px-2 py-1", threatTone(threat))}>
            Threat {threat}
          </span>
          <span className="rounded-sm border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-amber-200">
            Posture {posture}
          </span>
          {priorPosture && priorPosture !== posture ? (
            <span className="rounded-sm border border-cyan-400/40 px-2 py-1 text-cyan-200">
              {priorPosture} → {posture}
            </span>
          ) : null}
          <span className="rounded-sm border border-white/10 px-2 py-1 text-zinc-500">
            {isSample ? "SAMPLE" : "INGEST"}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[minmax(16rem,22%)_minmax(0,1fr)_minmax(20rem,32%)]">
        <Panel title="Signals" meta={`${cursor}/${source.length}`}>
          <SignalStream
            events={acceptedEvents}
            rejected={result?.rejected ?? []}
            discarded={result?.discardedNoise ?? []}
            now={clock}
            selectedId={selectedId}
            onSelect={setSelectedId}
            grades={grades}
            onQuarantine={toggleQuarantine}
          />
        </Panel>
        <Panel
          title={surface === "chart" ? "Training chart" : "MGRS grid"}
          meta={activeCluster?.admiraltyCode ?? "2525"}
          bodyClassName={
            surface === "chart" ? "flex flex-col overflow-hidden" : undefined
          }
          toolbar={
            <div
              role="group"
              aria-label="Map surface"
              className="flex items-center font-mono text-[10px] tracking-wider"
            >
              <button
                type="button"
                aria-pressed={surface === "chart"}
                onClick={() => setSurface("chart")}
                className={cn(
                  "px-1 py-0.5",
                  surface === "chart"
                    ? "text-amber-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                Chart
              </button>
              <span className="px-0.5 text-zinc-600" aria-hidden="true">
                |
              </span>
              <button
                type="button"
                aria-pressed={surface === "cells"}
                onClick={() => setSurface("cells")}
                className={cn(
                  "px-1 py-0.5",
                  surface === "cells"
                    ? "text-amber-100"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                Cells
              </button>
            </div>
          }
        >
          {surface === "chart" ? (
            <UnitMap
              events={plottedEvents}
              clusters={result?.clusters ?? []}
              selectedClusterId={selectedCluster}
              onSelectCluster={selectCluster}
            />
          ) : (
            <MgrsGrid
              events={plottedEvents}
              clusters={result?.clusters ?? []}
              selectedClusterId={selectedCluster}
              onSelectCluster={selectCluster}
            />
          )}
        </Panel>
        <Panel title="Commander SITREP" meta={result?.sitrep.analyticConfidence ?? "—"}>
          <SitrepPanel
            sitrep={result?.sitrep ?? null}
            raw={result?.sitrepText ?? ""}
            empty={!result}
          />
        </Panel>
      </div>

      <div className="h-36 shrink-0 overflow-hidden px-2 pb-1 max-lg:h-auto">
        <div className="mb-1 flex gap-1">
          <Button
            size="xs"
            variant={deck === "friction" ? "default" : "ghost"}
            onClick={() => setDeck("friction")}
          >
            Friction
          </Button>
          <Button
            size="xs"
            variant={deck === "ach" ? "default" : "ghost"}
            onClick={() => setDeck("ach")}
          >
            ACH matrix
          </Button>
          <span className="ml-auto self-center font-mono text-[10px] text-zinc-500">
            {result ? `${result.computeMs.toFixed(1)} ms` : ""} · keys 1-4 space L M C
          </span>
        </div>
        {deck === "friction" ? (
          <div className="h-28 overflow-auto">
            <LowerDeck result={result} />
          </div>
        ) : (
          <div className="grid h-28 grid-cols-2 gap-2 overflow-auto text-xs lg:grid-cols-4">
            {(result?.ach.hypotheses ?? []).map((hypothesis) => (
              <div key={hypothesis.id} className="tise-panel p-2">
                <p className="font-mono text-[10px] text-amber-200">
                  {(hypothesis.posterior * 100).toFixed(0)}%
                </p>
                <p className="text-zinc-200">{hypothesis.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-2 pb-2">
        <IngestDock
          playing={streaming}
          synacticReady={synactic.configured}
          synacticReason={synactic.reason}
          error={error}
          onPlay={() => loadScenario(scenarioId, true)}
          onPause={() => setPlaying(false)}
          onStep={() => {
            setPlaying(false);
            setCursor((value) => Math.min(source.length, value + 1));
          }}
          onReset={() => {
            setPlaying(false);
            setSource([]);
            setCursor(0);
            setQuarantine([]);
            setError(null);
          }}
          onPaste={onPaste}
          onSynactic={() => void onSynactic()}
          onAwareness={() => void exportCot("awareness")}
          onNominate={() => void exportCot("nomination")}
        />
      </div>

      <Dialog open={lineageOpen} onOpenChange={setLineageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Lineage · {activeCluster?.siteLabel ?? "AOI"}
            </DialogTitle>
            <DialogDescription>
              Payload hash to STANAG grade to opinion to posture.{" "}
              {activeCluster
                ? `b ${activeCluster.opinion.b.toFixed(2)} · d ${activeCluster.opinion.d.toFixed(2)} · u ${activeCluster.opinion.u.toFixed(2)}`
                : "Select a hot zone."}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto text-xs">
            {lineageObjects.map((object) => (
              <li key={object.id} className="flex gap-2 border-b border-white/10 pb-2">
                <span
                  className="block size-7 [&>svg]:size-7"
                  dangerouslySetInnerHTML={{
                    __html: renderMilSymbolSvg(object.sidc, { size: 28 }),
                  }}
                />
                <div>
                  <p className="text-zinc-100">
                    {object.kind} · {object.label}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {object.admiraltyCode} · {object.hashes[0]?.slice(0, 18) ?? "no hash"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={cotOpen} onOpenChange={setCotOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cursor on Target</DialogTitle>
            <DialogDescription>{cotNote}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto font-mono text-[10px] whitespace-pre-wrap text-zinc-200">
            {cotText || "No document. Nomination without a grant is refused."}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
