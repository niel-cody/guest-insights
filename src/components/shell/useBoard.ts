"use client";

import { useSyncExternalStore } from "react";
import type { Status } from "@/lib/status";

/**
 * The board, fetched once per page load and shared by everything that needs it.
 *
 * ── One request, not one per consumer ──────────────────────────────────────
 *
 * The sidebar draws forty-odd chips and the page header draws a control, and
 * all of them want the same table. A hook that fetched on mount would issue a
 * request per component; a context provider would mean wrapping a layout that
 * is otherwise entirely static. This is a module-level store with one in-flight
 * request, which every subscriber reads from.
 *
 * `useSyncExternalStore` for the same reason `use-scope` uses it: the snapshot
 * must be referentially stable or React spins, and the server snapshot must be
 * empty because the HTML was prerendered with no session.
 */

export type Board = { statuses: Record<string, { status: Status }>; staff: boolean };

const EMPTY: Board = Object.freeze({ statuses: {}, staff: false });

let snapshot: Board = EMPTY;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/**
 * Refetch, and let every chip on the page update together.
 *
 * Called after a status is saved. Without it the control that was just used
 * shows the new value and the forty chips in the nav still show the old one,
 * which reads as a save that half-failed.
 */
export async function refreshBoard() {
  try {
    const res = await fetch("/api/board", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as Board;
    snapshot = { statuses: json.statuses ?? {}, staff: Boolean(json.staff) };
    emit();
  } catch {
    // The board is a side-car. A reporting build does not go dark because it is
    // unreachable — every chip stays on "To do", which is legible and wrong in
    // the same direction as showing nothing at all.
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!started) {
    started = true;
    void refreshBoard();
  }
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

export function useBoard(): Board {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
