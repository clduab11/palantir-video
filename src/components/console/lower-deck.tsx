"use client";

import type { ReactNode } from "react";
import { cn } from "cn";

import type { SynthesisResult } from "@/lib/tise";

export function LowerDeck({ result }: { result: SynthesisResult | null }) {
  const conflicts = result?.sitrep.friction.conflictLog ?? [];
  const triggers = result?.sitrep.kineticTriggers ?? [];
  const gaps = result?.sitrep.verificationGaps ?? [];

  return (
    <div className="grid min-h-0 gap-2 lg:grid-cols-3">
      <DeckColumn title="Conflict log" count={result?.conflicts.length ?? 0}>
        {conflicts.length === 0 ? (
          <Empty>No friction until a stream is ingested.</Empty>
        ) : (
          <ul className="space-y-2">
            {conflicts.map((line, index) => (
              <li
                key={`${index}-${line}`}
                className="border-l-2 border-amber-500/60 bg-amber-950/20 px-2 py-1.5 text-xs leading-snug text-amber-100/90"
              >
                {line}
              </li>
            ))}
          </ul>
        )}
      </DeckColumn>
      <DeckColumn title="Kinetic triggers" count={triggers.filter((row) => row.armed).length}>
        {triggers.length === 0 ? (
          <Empty>Triggers arm as signatures corroborate.</Empty>
        ) : (
          <ul className="space-y-2">
            {triggers.map((trigger, index) => (
              <li
                key={`${index}-${trigger.condition}`}
                className={cn(
                  "border-l-2 px-2 py-1.5 text-xs leading-snug",
                  trigger.armed
                    ? "border-red-500 bg-red-950/30 text-red-100"
                    : "border-zinc-600 bg-zinc-900/40 text-zinc-400",
                )}
              >
                <span className="font-mono text-[10px] tracking-wider uppercase">
                  {trigger.armed ? "Armed" : "Watch"}
                </span>
                <p className="mt-0.5">{trigger.condition}</p>
                <p className="mt-0.5 text-zinc-400">{trigger.action}</p>
              </li>
            ))}
          </ul>
        )}
      </DeckColumn>
      <DeckColumn title="Verification gaps" count={gaps.length}>
        {gaps.length === 0 ? (
          <Empty>Blind spots appear after triage.</Empty>
        ) : (
          <ul className="space-y-2">
            {gaps.map((line, index) => (
              <li
                key={`${index}-${line}`}
                className="border-l-2 border-cyan-500/50 bg-cyan-950/20 px-2 py-1.5 text-xs leading-snug text-cyan-50/90"
              >
                {line}
              </li>
            ))}
          </ul>
        )}
      </DeckColumn>
    </div>
  );
}

function DeckColumn({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="tise-panel min-h-[160px] overflow-auto">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <h2 className="font-mono text-[10px] tracking-[0.2em] text-zinc-400 uppercase">
          {title}
        </h2>
        <span className="font-mono text-[10px] text-zinc-600">{count}</span>
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-3 text-xs text-zinc-500">{children}</p>;
}
