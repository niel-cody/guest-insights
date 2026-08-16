"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/instrument";

/**
 * R-189's collector. Mounted once in the org layout, so every surface is
 * covered without each surface remembering to opt in — which is how a build
 * ends up instrumented everywhere except the screen somebody actually wanted to
 * study.
 *
 * Page view, dwell and scroll depth are all derivable from the shell. Drawer
 * opens, filter changes and slider moves are reported by the controls
 * themselves, because only they know which control moved.
 */
export function Instrumentation() {
  const pathname = usePathname();
  const enteredAt = useRef(Date.now());
  const deepest = useRef(0);

  // The surface, not the URL. A URL carries filter values and a guest id, and a
  // local log is still a record of who somebody looked at.
  const surface = pathname.split("/").filter(Boolean).slice(1).join("/") || "home";

  useEffect(() => {
    enteredAt.current = Date.now();
    deepest.current = 0;
    track("surface.view", surface);

    // The scroll container is the page body, not the window — the shell keeps
    // the header fixed and scrolls the panel beneath it.
    const scroller = document.querySelector("main > div[class*=overflow-y-auto]");
    const onScroll = () => {
      if (!(scroller instanceof HTMLElement)) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 0) return;
      deepest.current = Math.max(deepest.current, Math.min(1, scroller.scrollTop / max));
    };
    scroller?.addEventListener("scroll", onScroll, { passive: true });

    const report = () => {
      track("surface.dwell", surface, undefined, Date.now() - enteredAt.current);
      if (deepest.current > 0) {
        track("surface.scrollDepth", surface, undefined, Math.round(deepest.current * 100) / 100);
      }
    };
    // Both, because a surface can be left by navigating or by closing the tab,
    // and dwell that only counts one of those understates every last screen.
    window.addEventListener("pagehide", report);

    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", report);
      report();
    };
  }, [surface]);

  return null;
}
