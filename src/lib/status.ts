/**
 * How far a surface has got, and what that is allowed to mean.
 *
 * ── One chip per item, not two ─────────────────────────────────────────────
 *
 * The nav already marked the production stand-ins `EXISTING`. Adding a working
 * state beside that would put two chips on some items and one on others, and a
 * reader would have to learn which of the two to believe. So `existing` is a
 * value in the same vocabulary rather than a second axis: it *is* the state of
 * Loyalty Spend — it ships, and this build is not touching it.
 *
 * ── Why `todo` is the absence of a row ─────────────────────────────────────
 *
 * `surface_status` carries only surfaces somebody has actually moved. An empty
 * table is a correct and complete answer, not a missing one, and it means
 * adding a surface to the nav never requires remembering to seed a row for it.
 */
export const STATUSES = ["todo", "in_progress", "reviewing", "approved", "done"] as const;
export type Status = (typeof STATUSES)[number];

/** What a nav item can display. `existing` is fixed in code, never in the table. */
export type ChipState = Status | "existing";

export const STATUS_LABEL: Record<ChipState, string> = {
  todo: "To do",
  in_progress: "In progress",
  reviewing: "Reviewing",
  approved: "Approved",
  done: "Done",
  existing: "Existing",
};

/**
 * Colour carries meaning here, so it is deliberately not a rainbow.
 *
 * Three of the six are neutral — a surface being untouched, shipped elsewhere,
 * or finished are all *quiet* states that need no attention. The two that want
 * somebody are the two that get colour: `reviewing` is waiting on a person, and
 * `approved` is the one result worth seeing across a whole nav at a glance.
 * `in_progress` sits between as a soft accent.
 *
 * A palette where every state shouts is a palette where none of them does.
 */
export const STATUS_TONE: Record<ChipState, "quiet" | "accent" | "warning" | "good"> = {
  todo: "quiet",
  existing: "quiet",
  in_progress: "accent",
  reviewing: "warning",
  approved: "good",
  done: "quiet",
};

/**
 * The dot's colour, and why it is not simply `STATUS_TONE`.
 *
 * A chip carries its own label, so colour there is reinforcement and three of
 * the six can share a neutral without anything being lost. **A dot has no
 * label**, so colour is the entire signal and every state has to be
 * distinguishable from every other one at eight pixels.
 *
 * The pair that would otherwise collide is `todo` and `done` — both are quiet,
 * neither wants attention. They are separated by fill rather than hue: `todo`
 * is a hollow ring, because nothing has happened to it yet, and `done` is
 * solid. That reads correctly even to someone who cannot tell the two greys
 * apart, which is the point.
 */
export const STATUS_DOT: Record<ChipState, { color: string; hollow?: boolean }> = {
  todo: { color: "var(--ink-muted)", hollow: true },
  existing: { color: "var(--ink-muted)", hollow: true },
  in_progress: { color: "var(--accent)" },
  reviewing: { color: "var(--warning)" },
  approved: { color: "var(--good)" },
  done: { color: "var(--ink-secondary)" },
};

export function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/**
 * What people can say, and it is not a thumbs up.
 *
 * A like/dislike pair tells you a score and nothing you can act on. These four
 * name the *kind* of problem, which is the part that decides who fixes it and
 * how: `confusing` is a design fault, `wrong` is a data or logic fault, and
 * those go to different people. `idea` keeps requests out of the defect pile.
 */
export const SENTIMENTS = ["works", "confusing", "wrong", "idea"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  works: "This works",
  confusing: "This confused me",
  wrong: "This looks wrong",
  idea: "Idea",
};

export const SENTIMENT_HINT: Record<Sentiment, string> = {
  works: "Worth keeping. Say what made it land.",
  confusing: "You could not tell what it meant, or had to work it out.",
  wrong: "The number or the claim looks incorrect.",
  idea: "Something that is not here and should be.",
};

export const SENTIMENT_TONE: Record<Sentiment, "quiet" | "accent" | "warning" | "good"> = {
  works: "good",
  confusing: "warning",
  wrong: "warning",
  idea: "accent",
};

export function isSentiment(v: unknown): v is Sentiment {
  return typeof v === "string" && (SENTIMENTS as readonly string[]).includes(v);
}
