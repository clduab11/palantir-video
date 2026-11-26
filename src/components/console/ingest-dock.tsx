"use client";

import { useState } from "react";
import { Pause, Play, SkipForward, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function IngestDock({
  playing,
  synacticReady,
  synacticReason,
  error,
  onPlay,
  onPause,
  onStep,
  onReset,
  onPaste,
  onSynactic,
  onAwareness,
  onNominate,
}: {
  playing: boolean;
  synacticReady: boolean;
  synacticReason: string;
  error: string | null;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onPaste: (raw: string) => void;
  onSynactic: () => void;
  onAwareness: () => void;
  onNominate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="tise-panel flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {playing ? (
          <Button size="sm" variant="secondary" onClick={onPause}>
            <Pause />
            Pause stream
          </Button>
        ) : (
          <Button size="sm" onClick={onPlay}>
            <Play />
            Play District Seven
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onStep}>
          <SkipForward />
          Step
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Upload />
          Paste JSON
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                disabled={!synacticReady}
                onClick={onSynactic}
              />
            }
          >
            Pull Synactic
          </TooltipTrigger>
          <TooltipContent>{synacticReason}</TooltipContent>
        </Tooltip>
        <Button size="sm" variant="ghost" onClick={onReset}>
          <Trash2 />
          Clear
        </Button>
        <Button size="sm" variant="outline" onClick={onAwareness}>
          Awareness CoT
        </Button>
        <Button size="sm" variant="outline" onClick={onNominate}>
          Nominate strike
        </Button>
      </div>
      <p className="max-w-xl font-mono text-[10px] leading-relaxed text-zinc-500">
        {error ? (
          <span className="text-red-300">{error}</span>
        ) : (
          "Rejects anything without provenance or confidence_score. Sample stream is fictional."
        )}
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ingest TISE JSON</DialogTitle>
            <DialogDescription>
              One event, an array, or a SynacticEvent envelope. Missing
              provenance or confidence_score is a hard reject.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-48 font-mono text-xs"
            placeholder='{"event_id":"...","provenance":"...","confidence_score":0.7,...}'
          />
          <DialogFooter>
            <Button
              onClick={() => {
                onPaste(draft);
                setOpen(false);
              }}
            >
              Synthesize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
