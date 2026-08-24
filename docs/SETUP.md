# Switching the board on

Everything in this document is about **one feature**: surface status and
feedback. The reports do not depend on any of it — they read pre-extracted JSON
from `data/` and are prerendered at build time. If you never do a single step
below, the app keeps working exactly as it does now.

What you get at the end: a **State** control in the header of every report, a
status chip beside every item in the nav, a **Give feedback** button on every
page, and an inbox at **Platform › Feedback**.

Roughly ten minutes, and step 1 is the only one that needs you specifically.

---

## Before you start

| | |
|---|---|
| Supabase project | `guest-insights` — ref `iicrnoruawjjholtmqef` |
| Project URL | `https://iicrnoruawjjholtmqef.supabase.co` |
| Vercel project | `pixie-dust-industries/guest-insights` |
| Schema and RLS | Already applied. Nothing to run. |

The database side is done. Tables, policies and the seeded statuses are in
place, and the security advisors are clean. What is missing is the credential
that lets the deployed app talk to it.

---

## 1. Copy the service-role key

Open the [project dashboard](https://supabase.com/dashboard/project/iicrnoruawjjholtmqef)
and go to **Project Settings → API keys**. Depending on when your dashboard last
updated, it may be labelled **API** instead — either way it is the page listing
`anon`/publishable alongside `service_role`.

Find **`service_role`** — the one marked secret, behind a *Reveal* button. Copy it.

> **Do not paste it into a chat, a ticket, or this repository.** It bypasses row
> level security completely: anything holding it can read and write every table
> regardless of policy. It belongs in exactly two places — Vercel's environment
> variables, and your local `.env.local`, which is gitignored.
>
> This is the one step I could not do for you, and deliberately so.

You do **not** need the `anon` or publishable key. The app never uses them.

---

## 2. Put it in Vercel

Go to **[Settings → Environment Variables](https://vercel.com/pixie-dust-industries/guest-insights/settings/environment-variables)**.

Add two variables. Tick **Production**, **Preview** and **Development** for both.

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://iicrnoruawjjholtmqef.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the key from step 1 |

**Neither name starts with `NEXT_PUBLIC_`, and neither ever should.** That
prefix inlines a value into the JavaScript served to every visitor. This
repository is public, so a service-role key exposed that way is a database
handed to anyone who reads the source.

Two things stop that happening by accident: `src/lib/board.ts` imports
`server-only`, which makes it a *build error* for any client component to reach
it; and `npm run test:layout` scans every chunk in `.next/static` for the
service-role name, a `service_role` token, a publishable key and a project URL,
failing the suite if it finds one.

---

## 3. Redeploy

Environment variables only reach a deployment that was built after they existed.
The currently deployed build was not, so it will keep reporting the board as
unconfigured until you replace it.

**[Deployments](https://vercel.com/pixie-dust-industries/guest-insights/deployments)**
→ the most recent one → **⋯** → **Redeploy**.

Or push any commit to `main`, which does the same thing.

---

## 4. Check it actually works

Sign in with the **Oolio** password — the one whose grant is `["*"]`. The other
two are merchant grants and deliberately see less.

**In the header of any report**, beside the coverage chip, you should see a
control reading **State · To do** and a **Give feedback** button.

1. Open **Guests › Overview**. Its chip should already read **REVIEWING**, and
   **Retention and Churn** should read **IN PROGRESS** — both seeded, both
   yours to change.
2. Change one with the **State** control. The chip in the left nav should move
   at the same time, not on the next reload. If the header updates and the nav
   does not, the write landed and the refetch did not — tell me.
3. Click **Give feedback**, pick one of the four kinds, write anything, send.
   The panel stays open and confirms the exact path it recorded against.
4. Open **Platform › Feedback**. Your note should be there, with the path as a
   link back to the view you wrote it from.

If all four work, you are done.

---

## 5. Local development (optional)

Only needed if you want the board working on `localhost`.

Add the same two lines to `.env.local` — the file already holds `SITE_ACCESS`
and `SESSION_SECRET`, and is gitignored:

```bash
SUPABASE_URL=https://iicrnoruawjjholtmqef.supabase.co
SUPABASE_SERVICE_ROLE_KEY=paste-the-service-role-key-here
```

Then:

```bash
npm run dev
```

`.env.example` documents both variables and why they are shaped this way.

---

## When something is wrong

**Platform › Feedback says the board is not configured.**
It names the missing variable. Either it was not saved, or the deployment
predates it — redo step 3.

**Platform › Feedback 404s.**
You are signed in on a merchant password. The inbox is staff-only, and it 404s
rather than explaining itself, because "you may not see this" is itself an
answer to "does this exist". Sign in with the Oolio password.

**No State control in the header.**
Same cause. A merchant grant sees the status as a read-only chip and no control
— they can tell you a page confused them, which is the point of sharing it, but
"reviewing" and "approved" are claims about this build's progress and the
audience being reviewed does not get to set them.

**Chips all read "To do" and nothing saves.**
The app cannot reach Supabase. That is a deliberate soft failure — a reporting
build does not go dark because a side-car is down — so check the Vercel function
logs rather than expecting an error on screen.

**Feedback sends but the inbox is empty.**
Unlikely, but it would mean the insert succeeded against a different project
than the one you are reading. Check `SUPABASE_URL` is the ref above.

---

## What this does not do yet

**Login is still the shared-password gate.** Three passwords, one per audience.
That is why feedback is attributed to *"Meat Flour Wine"* rather than to a
person: with a shared password, the grant **is** the identity, so when a note
says "this looks wrong" there is no one to ask what they meant.

The agreed next step is **magic-link auth**, which fixes attribution as a side
effect of fixing login. The groundwork is already in the database — a `profiles`
table with `role` and `orgs`, and RLS policies written against it and waiting.

Still to build:

- an `invites` table mapping email → orgs + role
- a signup trigger: `@oolio.com` gets every organisation automatically,
  everyone else gets exactly what their invite says, and an uninvited signup
  gets a valid login that can see nothing
- the magic-link login screen, replacing the password form
- **Platform › People**, so you grant access in the app rather than in the
  Supabase dashboard

**One prerequisite is yours, not mine.** Supabase's built-in email sender is
rate-limited to a handful per hour and is not meant for production. Sharing with
a dozen merchant staff will hit that ceiling. Wiring a real SMTP provider
(Resend is the usual choice) into Supabase Auth has to happen before magic links
are usable by anyone but you.

---

## One thing worth knowing now

**Renaming a listed report loses its status.** The thirty-five live reports in
the nav have no route, so they key off a slug of their label — `Trading Monitor`
becomes `trading-monitor`. Rename it and the board no longer recognises it, and
its state resets to "To do".

Built surfaces are safe: they key off their route, which does not move.

The alternative is a permanent opaque id on every row, which is right for a
product and overkill for a nav whose entire purpose is to be argued about and
rearranged. Worth knowing before you rename things, not worth solving yet.
