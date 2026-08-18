import { safeNext } from "@/lib/gate";
import { LoginForm } from "./LoginForm";

/**
 * The login page. The one route the proxy does not gate.
 *
 * ── Dynamic on purpose ─────────────────────────────────────────────────────
 *
 * Every report page in this build is `force-static`. This one must not be: it
 * reads `?next=` per request, and a prerendered login page would also be a
 * cacheable one — which is how a signed-in response ends up in a shared cache
 * and served to somebody who never presented a cookie.
 *
 * ── It says nothing about what is behind it ────────────────────────────────
 *
 * No merchant name, no figures, no "19 venues". The point of the gate is that
 * strangers do not learn what this is, and a login page that advertises the
 * contents has given away the part that mattered before anybody types anything.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in",
  // A gate that gets indexed is a gate somebody can find.
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  // `safeNext` returns null for anything that is not an in-site path.
  const next = safeNext(raw) ?? "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken p-6">
      <div className="w-full max-w-[360px] rounded-xl border border-line bg-surface-raised p-6">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-[14px] font-semibold text-white"
            style={{ background: "var(--brand)" }}
            aria-hidden
          >
            O
          </span>
          <h1 className="text-[15px] font-semibold text-ink">Oolio Insights</h1>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
          This is a private preview. Enter the password to continue.
        </p>

        <LoginForm next={next} />
      </div>
    </main>
  );
}
