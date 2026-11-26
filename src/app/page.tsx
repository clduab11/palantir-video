"use client";

import dynamic from "next/dynamic";

const TiseConsole = dynamic(
  () =>
    import("@/components/console/tise-console").then((mod) => mod.TiseConsole),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-[#070b10] font-mono text-xs tracking-[0.28em] text-cyan-300/80 uppercase">
        TISE bringing the picture up
      </div>
    ),
  },
);

export default function Home() {
  return <TiseConsole />;
}
