"use client";

import { cn } from "cn";

import { ageLabel, threatTone, vectorTone } from "@/lib/tise/format";
import type { Rejection, TiseEvent } from "@/lib/tise/types";

export function SignalStream({
  events,
  rejected,
  discarded,
  now,
  selectedId,
  onSelect,
  grades,
  onQuarantine,
}: {
  events: TiseEvent[];
  rejected: Rejection[];
  discarded: TiseEvent[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  grades?: Record<string, { code: string; falsity: number; whaley: string; quarantined: boolean }>;
  onQuarantine?: (id: string) => void;
}) {
  const ordered = [...events].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );

  if (ordered.length === 0 && rejected.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 px-4 py-8 text-center">
        <p className="font-mono text-xs tracking-[0.18em] text-zinc-500 uppercase">
          No stream
        </p>
        <p className="text-sm text-zinc-400">
          Load District Seven or paste TISE JSON. Events without provenance or
          confidence_score are rejected at the gate.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/5">
      {rejected.map((item) => (
        <li
          key={`rej-${item.index}-${item.event_id ?? "unknown"}`}
          className="border-l-2 border-red-500 bg-red-950/30 px-2.5 py-1.5"
        >
          <p className="font-mono text-[10px] tracking-wider text-red-300 uppercase">
            Rejected
          </p>
          <p className="text-xs text-red-100/90">{item.reason}</p>
        </li>
      ))}
      {ordered.map((event) => {
        const discardedHit = discarded.some(
          (row) => row.event_id === event.event_id,
        );
        const grade = grades?.[event.event_id];
        return (
          <li key={event.event_id}>
            <div
              className={cn(
                "flex w-full flex-col gap-1 px-2.5 py-1.5 transition-colors hover:bg-white/5",
                selectedId === event.event_id && "bg-amber-500/10",
                discardedHit && "opacity-45",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(event.event_id)}
                className="flex w-full flex-col gap-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
                      vectorTone(event.vector_type),
                    )}
                  >
                    {event.vector_type}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {ageLabel(event.timestamp, now)}
                    {discardedHit ? " · NOISE" : ""}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-snug text-zinc-200">
                  {event.payload}
                </p>
              </button>
              <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-zinc-500">
                <span className="truncate">
                  {event.source_id}
                  {grade ? ` · ${grade.code}` : ""}
                  {grade && grade.falsity >= 0.4
                    ? ` · ${grade.whaley} ${grade.falsity.toFixed(2)}`
                    : ""}
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "rounded-sm border px-1 py-0.5",
                      threatTone(event.perceived_threat_level),
                    )}
                  >
                    {event.perceived_threat_level} · p=
                    {event.confidence_score.toFixed(2)}
                  </span>
                  {onQuarantine ? (
                    <button
                      type="button"
                      data-testid={`quarantine-${event.event_id}`}
                      aria-label={
                        grade?.quarantined ? "Restore event" : "Quarantine event"
                      }
                      aria-pressed={Boolean(grade?.quarantined)}
                      onClick={() => onQuarantine(event.event_id)}
                      className={cn(
                        "rounded-sm border px-1 py-0.5",
                        grade?.quarantined
                          ? "border-red-400 text-red-200"
                          : "border-white/15 hover:border-cyan-400/50 hover:text-cyan-100",
                      )}
                    >
                      {grade?.quarantined ? "IN" : "OUT"}
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
