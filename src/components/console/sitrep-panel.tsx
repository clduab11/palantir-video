"use client";

import { Copy, Check } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { threatTone } from "@/lib/tise/format";
import type { Sitrep } from "@/lib/tise/types";
import { cn } from "cn";

export function SitrepPanel({
  sitrep,
  raw,
  empty,
}: {
  sitrep: Sitrep | null;
  raw: string;
  empty: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"structured" | "raw">("structured");

  if (empty || !sitrep) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-5 py-8 text-center">
        <p className="font-mono text-xs tracking-[0.18em] text-zinc-500 uppercase">
          No SITREP
        </p>
        <p className="text-sm text-zinc-400">
          The engine does not guess. Feed it a valid stream and it will write
          the commander product — or reject the input.
        </p>
      </div>
    );
  }

  async function copyRaw() {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2.5">
        <div className="flex gap-1">
          <Button
            size="xs"
            variant={mode === "structured" ? "default" : "ghost"}
            onClick={() => setMode("structured")}
          >
            Structured
          </Button>
          <Button
            size="xs"
            variant={mode === "raw" ? "default" : "ghost"}
            onClick={() => setMode("raw")}
          >
            Raw template
          </Button>
        </div>
        <Button size="xs" variant="outline" onClick={() => void copyRaw()}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {mode === "raw" ? (
        <pre className="tise-scroll min-h-0 flex-1 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-200">
          {raw}
        </pre>
      ) : (
        <div className="tise-scroll min-h-0 flex-1 space-y-3 p-2.5">
          <div className="font-mono text-[10px] tracking-wider text-zinc-500">
            {sitrep.sitrepId}
            <br />
            {sitrep.timestamp} · AOI {sitrep.aoi}
            <br />
            ICD 203 confidence {sitrep.analyticConfidence}
          </div>
          <p className="text-xs leading-relaxed text-zinc-300">
            {sitrep.estimativeAssessment}
          </p>
          <Section title="I. Threat surface">
            <p
              className={cn(
                "inline-flex rounded-sm border px-2 py-0.5 font-mono text-xs",
                threatTone(sitrep.threatSurface.threatLevel),
              )}
            >
              {sitrep.threatSurface.threatLevel}
            </p>
            <p className="mt-2 text-sm text-zinc-200">
              {sitrep.threatSurface.enemyPosture}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {sitrep.threatSurface.detectedEntities.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </Section>
          <Section title="II. Friction & dissonance">
            <p className="font-mono text-xs text-amber-200">
              Deception risk: {sitrep.friction.deceptionRisk}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {sitrep.friction.conflictLog.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-500">
              {sitrep.friction.dataDecay.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </Section>
          <Section title="III. Kinetic triggers">
            <ul className="space-y-2">
              {sitrep.kineticTriggers.map((trigger, index) => (
                <li
                  key={`${index}-${trigger.condition}`}
                  className="border-l-2 border-white/15 pl-2 text-xs text-zinc-300"
                >
                  <span className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                    {trigger.armed ? "Armed" : "Watch"}
                  </span>
                  <p>If {trigger.condition.replace(/^If\s+/i, "")}</p>
                  <p className="text-zinc-500">→ {trigger.action}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="IV. Verification gaps">
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-zinc-300">
              {sitrep.verificationGaps.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </Section>
          <Section title="V. Recommended posture">
            <p className="font-mono text-base tracking-[0.18em] text-amber-200">
              {sitrep.recommendedPosture}
            </p>
            <p className="mt-1 text-xs text-zinc-400">{sitrep.postureRationale}</p>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 font-mono text-[10px] tracking-[0.2em] text-cyan-300/80 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
