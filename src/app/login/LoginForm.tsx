"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

/**
 * The form. The only interactive part of the login page.
 *
 * The password field is a real `<input type="password">` with
 * `autoComplete="current-password"`, so a password manager recognises it and
 * offers to store the secret rather than leaving the operator to keep it in a
 * note. That is the difference between a shared password that stays secret and
 * one that ends up pasted into Slack.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { error: null });

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-secondary">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error" : undefined}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      {state.error && (
        <p
          id="login-error"
          role="alert"
          className="text-[13px]"
          style={{ color: "var(--critical)" }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-lg px-3 py-2 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {pending ? "Checking…" : "Open the report"}
      </button>
    </form>
  );
}
