import type { ReactNode } from "react";
import { cn } from "cn";

export function Panel({
  title,
  meta,
  className,
  bodyClassName,
  toolbar,
  children,
}: {
  title: string;
  meta?: string;
  className?: string;
  bodyClassName?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "tise-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <h2 className="shrink-0 font-mono text-[10px] font-semibold tracking-[0.22em] text-amber-200/90 uppercase">
          {title}
        </h2>
        <div className="flex min-w-0 items-center gap-2">
          {toolbar}
          {meta ? (
            <span className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
              {meta}
            </span>
          ) : null}
        </div>
      </header>
      <div className={cn("min-h-0 flex-1", bodyClassName ?? "overflow-auto")}>
        {children}
      </div>
    </section>
  );
}
