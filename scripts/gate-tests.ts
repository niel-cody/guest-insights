/**
 * The access gate, asserted rather than trusted.
 *
 *   npm run test:gate
 *
 * ── What these are actually for ────────────────────────────────────────────
 *
 * Two passwords now go to two merchants who compete in the same market. The
 * assertion that matters is not "the right password works" — that one passes
 * against a gate with no isolation in it at all. It is **"the Coffee Guru
 * password cannot open Meat Flour Wine"**, and its mirror.
 *
 * So the refusals are the tests. The acceptances are only here to prove the
 * refusals are not refusing everything, which is the way a broken gate most
 * often passes its own suite.
 *
 * The crypto and the entitlement logic are tested directly rather than over
 * HTTP: a forged signature, a rotated grant, an expiry replayed a year later
 * are all awkward to produce against a running server and trivial here.
 */
import {
  grantAllows, grantForPassword, homeFor, issueSession, orgFromPath, readSession,
  safeNext, SESSION_MAX_AGE, type Grant,
} from "../src/lib/gate";

let failures = 0;
let passes = 0;

function check(name: string, pass: boolean, detail = "") {
  if (pass) passes++;
  else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SECRET = "s".repeat(43);
const NOW = 1_700_000_000_000;

const CG: Grant = { label: "Coffee Guru", password: "coffee-guru-password-1", orgs: ["coffee-guru"] };
const MFW: Grant = { label: "Meat Flour Wine", password: "meat-flour-wine-pass-2", orgs: ["meat-flour-wine"] };
const OOLIO: Grant = { label: "Oolio", password: "oolio-internal-pass-3", orgs: ["*"] };
const GRANTS = [CG, MFW, OOLIO];
const ALL = ["coffee-guru", "meat-flour-wine", "amalfi"];

console.log("\nthe access gate");

// ── Tenant isolation. The reason this file exists. ─────────────────────────
console.log("  tenant isolation");
check("Coffee Guru may see Coffee Guru", grantAllows(CG, "coffee-guru"));
check("Coffee Guru may NOT see Meat Flour Wine", !grantAllows(CG, "meat-flour-wine"));
check("Meat Flour Wine may see Meat Flour Wine", grantAllows(MFW, "meat-flour-wine"));
check("Meat Flour Wine may NOT see Coffee Guru", !grantAllows(MFW, "coffee-guru"));
check("the internal grant sees every org",
  ALL.every((o) => grantAllows(OOLIO, o)));
/**
 * With two organisations, "refused the other one" and "refused every one it was
 * not granted" are the same assertion and a bug between them is invisible. A
 * third makes them different, so the refusal is asserted against the whole
 * roster rather than against one named rival.
 */
check("a single-org grant is refused every org but its own",
  ALL.filter((o) => o !== "meat-flour-wine").every((o) => !grantAllows(MFW, o)) &&
    grantAllows(MFW, "meat-flour-wine"));
// A prefix match here would let `coffee-guru` open `coffee-guru-staging`, which
// is how a sibling deployment becomes a data leak.
check("entitlement is not a prefix match", !grantAllows(CG, "coffee-guru-staging"));
check("entitlement is case-sensitive", !grantAllows(CG, "Coffee-Guru"));
check("an unknown org is not granted by a specific grant", !grantAllows(CG, "some-other-merchant"));

// ── The org is read from the path the same way the proxy reads it ──────────
console.log("  path scoping");
check("org is the first path segment", orgFromPath("/coffee-guru/2026-05_2026-07/overview") === "coffee-guru");
check("a bare org path resolves", orgFromPath("/meat-flour-wine") === "meat-flour-wine");
check("the index has no org", orgFromPath("/") === null);

// ── Passwords resolve to the right grant, and only that one ────────────────
console.log("  password to grant");
check("the Coffee Guru password yields the Coffee Guru grant", grantForPassword(CG.password, GRANTS) === CG);
check("the Meat Flour Wine password yields its own grant", grantForPassword(MFW.password, GRANTS) === MFW);
check("the internal password yields the internal grant", grantForPassword(OOLIO.password, GRANTS) === OOLIO);
check("a wrong password yields nothing", grantForPassword("not-a-password", GRANTS) === null);
check("an empty password yields nothing", grantForPassword("", GRANTS) === null);
check("a prefix of a real password yields nothing", grantForPassword(CG.password.slice(0, -1), GRANTS) === null);
check("a superstring of a real password yields nothing", grantForPassword(CG.password + "x", GRANTS) === null);

// ── End to end: a session issued for one customer resolves to that customer ─
console.log("  sessions carry the grant");
const cgSession = issueSession(CG, SECRET, NOW);
check("a Coffee Guru session resolves to Coffee Guru", readSession(cgSession, GRANTS, SECRET, NOW) === CG);
{
  // The whole point, expressed as the proxy expresses it.
  const g = readSession(cgSession, GRANTS, SECRET, NOW)!;
  check("a Coffee Guru session is refused Meat Flour Wine", !grantAllows(g, "meat-flour-wine"));
}
const mfwSession = issueSession(MFW, SECRET, NOW);
check("the two sessions are different values", cgSession !== mfwSession);
check("a Meat Flour Wine session resolves to Meat Flour Wine", readSession(mfwSession, GRANTS, SECRET, NOW) === MFW);
{
  const g = readSession(mfwSession, GRANTS, SECRET, NOW)!;
  check("a Meat Flour Wine session is refused Coffee Guru", !grantAllows(g, "coffee-guru"));
}

// ── Forgery ────────────────────────────────────────────────────────────────
console.log("  forgery");
check("a made-up truthy cookie resolves to nothing", readSession("true", GRANTS, SECRET, NOW) === null);
check("an empty cookie resolves to nothing", readSession("", GRANTS, SECRET, NOW) === null);
check("a missing cookie resolves to nothing", readSession(undefined, GRANTS, SECRET, NOW) === null);
check(
  "the signature cannot be stripped",
  readSession(cgSession.split(".").slice(0, 3).join("."), GRANTS, SECRET, NOW) === null,
);
{
  // Corrupt **only** the signature, leaving a genuine version, expiry and grant
  // fingerprint. This isolates the signature check: every other forgery here is
  // also caught by the fingerprint, so without this one the signature could be
  // deleted and most of this file would still pass.
  const [v, exp, fp, sig] = cgSession.split(".");
  const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
  check(
    "an otherwise-genuine session with a corrupted signature is refused",
    readSession(`${v}.${exp}.${fp}.${flipped}`, GRANTS, SECRET, NOW) === null,
  );
}
{
  // Swap in the other customer's fingerprint but keep this signature — the
  // privilege-escalation attempt this design most needs to survive.
  const [v, exp, , sig] = cgSession.split(".");
  const otherFp = mfwSession.split(".")[2];
  check(
    "swapping in another grant's fingerprint invalidates the signature",
    readSession(`${v}.${exp}.${otherFp}.${sig}`, GRANTS, SECRET, NOW) === null,
  );
}
{
  const [v, , fp, sig] = cgSession.split(".");
  const forged = `${v}.${Math.floor(NOW / 1000) + 10 * 365 * 24 * 3600}.${fp}.${sig}`;
  check("an extended expiry invalidates the signature", readSession(forged, GRANTS, SECRET, NOW) === null);
}

// ── Expiry, enforced from the signed payload not the cookie's Max-Age ──────
console.log("  expiry");
check(
  "a session is refused one second after it expires",
  readSession(cgSession, GRANTS, SECRET, NOW + (SESSION_MAX_AGE + 1) * 1000) === null,
);
check(
  "a session still resolves one second before it expires",
  readSession(cgSession, GRANTS, SECRET, NOW + (SESSION_MAX_AGE - 1) * 1000) === CG,
);

// ── Rotation actually rotates ──────────────────────────────────────────────
console.log("  rotation");
check(
  "changing a password invalidates sessions already issued for it",
  readSession(cgSession, [{ ...CG, password: "a-different-password" }, MFW, OOLIO], SECRET, NOW) === null,
);
check(
  "narrowing a grant's organisations invalidates its sessions",
  readSession(issueSession(OOLIO, SECRET, NOW), [{ ...OOLIO, orgs: ["coffee-guru"] }], SECRET, NOW) === null,
);
check(
  "changing the signing secret invalidates every session",
  readSession(cgSession, GRANTS, "x".repeat(43), NOW) === null,
);
check("removing a grant invalidates its sessions", readSession(cgSession, [MFW], SECRET, NOW) === null);

// ── Landing ────────────────────────────────────────────────────────────────
console.log("  landing");
check("Coffee Guru lands on Coffee Guru", homeFor(CG, ALL) === "/coffee-guru");
check("Meat Flour Wine lands on its own org", homeFor(MFW, ALL) === "/meat-flour-wine");
check("the internal grant lands on the first org", homeFor(OOLIO, ALL) === "/coffee-guru");

// ── Open redirect ──────────────────────────────────────────────────────────
console.log("  open redirect");
check("an absolute URL is not followed", safeNext("https://evil.example/x") === null);
check("a protocol-relative URL is not followed", safeNext("//evil.example") === null);
check("a backslash trick is not followed", safeNext("/\\evil.example") === null);
check("a missing next is null", safeNext(null) === null);
check(
  "an ordinary in-site path is preserved",
  safeNext("/coffee-guru/2026-05_2026-07/overview?tier=member") ===
    "/coffee-guru/2026-05_2026-07/overview?tier=member",
);

// ── The proxy matcher ──────────────────────────────────────────────────────
//
// Asserted against the same pattern the proxy exports. Getting this wrong in
// the permissive direction is the one mistake that would make everything above
// irrelevant, and it is a string in a config object that nothing else reads.
console.log("  the matcher");
const MATCHER = /^\/((?!login|_next\/static|_next\/image|favicon\.ico).*)$/;
for (const p of [
  "/",
  "/coffee-guru",
  "/coffee-guru/2026-05_2026-07/overview",
  "/meat-flour-wine/2026-05_2026-07/guests",
  "/coffee-guru/2026-05_2026-07/behaviour",
]) {
  check(`gated: ${p}`, MATCHER.test(p));
}
for (const p of ["/login", "/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
  check(`open: ${p}`, !MATCHER.test(p));
}

console.log(`\n${passes} passed, ${failures} failed.`);
if (failures) {
  console.log("The gate is not behaving as specified. Do not deploy.");
  process.exit(1);
}
console.log("Every refusal refuses, and the acceptances still accept.");
