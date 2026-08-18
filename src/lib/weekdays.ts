/**
 * Monday-first weekdays, with the `DAYOFWEEK` index the warehouse actually
 * emits.
 *
 * ── Why this is not in `DayMatrix` any more ────────────────────────────────
 *
 * It used to be, and that was fine until `DayMatrix` needed `useState` for its
 * tooltip and became a client component. A `"use client"` module's exports are
 * client *references* on the server, not values — so a server component
 * importing this array got a proxy and `WEEKDAYS.map is not a function` at
 * prerender, on one page, in the build rather than in the editor.
 *
 * Plain data with no directive, imported by both sides, cannot do that again.
 *
 * **The rotation happens here, once**, at the boundary between measurement and
 * presentation. The warehouse emits Sunday as 0 because that is the `DAYOFWEEK`
 * convention; a trading week that starts on Sunday reads wrong to everybody who
 * runs a roster, and the extract does not rotate because a rotation is a
 * presentation choice.
 */
export const WEEKDAYS = [
  { dow: 1, label: "Mon", long: "Monday" },
  { dow: 2, label: "Tue", long: "Tuesday" },
  { dow: 3, label: "Wed", long: "Wednesday" },
  { dow: 4, label: "Thu", long: "Thursday" },
  { dow: 5, label: "Fri", long: "Friday" },
  { dow: 6, label: "Sat", long: "Saturday" },
  { dow: 0, label: "Sun", long: "Sunday" },
] as const;
