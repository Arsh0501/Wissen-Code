import BrandLogo from "../../components/landing/BrandLogo";
import ThemeToggle from "../../components/ThemeToggle";
import { useAuth } from "../../context/AuthContext";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiData } from "../../services/workflows";
import { apiError } from "../../services/api";
export default function AccountAction() {
  const { signInWithToken, isLoggedIn } = useAuth();
  const action = useParams().action ?? "forgot";
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const request = useMutation({
    mutationFn: async () => {
      if (action === "sso") {
        const session = await apiData<{
          user: import("../../context/AuthContext").AuthUser;
          accessToken: string;
          refreshToken: string;
        }>("/auth/sso/session", "post");
        signInWithToken(session.user, session.accessToken);
        localStorage.setItem("wissen-refresh-token", session.refreshToken);
        return { message: "Signed in." };
      }
      return apiData<{ message: string }>(
        `/auth/${action === "reset" ? "reset-password" : action === "verify" ? "verify-email" : "forgot-password"}`,
        "post",
        action === "forgot"
          ? { email }
          : {
              token: params.get("token"),
              ...(action === "reset" ? { password } : {}),
            },
      );
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    request.mutate();
  }
  if (action === "sso" && isLoggedIn) return <Navigate to="/" replace />;
  return (
    <main className="account-recovery min-h-screen grid place-items-center bg-surface-950 p-5">
      <ThemeToggle className="absolute top-5 right-5" />
      <div className="card max-w-md w-full space-y-5">
        <Link
          className="inline-flex mb-4"
          to="/welcome"
          aria-label="Wissen Code home"
        >
          <BrandLogo />
        </Link>
        <h1 className="text-2xl font-semibold">
          {action === "sso"
            ? "Company single sign-on"
            : action === "reset"
              ? "Choose a new password"
              : action === "verify"
                ? "Verify your email"
                : "Recover your account"}
        </h1>
        <form onSubmit={submit} className="space-y-4">
          {action === "forgot" && (
            <label className="label">
              Email
              <input
                className="input mt-2"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {action === "reset" && (
            <label className="label">
              New password
              <input
                className="input mt-2"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="text-xs text-surface-500">
                Use at least 12 characters.
              </span>
            </label>
          )}
          <button
            className="btn-primary"
            disabled={request.isPending || request.isSuccess}
          >
            {request.isPending
              ? "Processing…"
              : action === "sso"
                ? "Continue to workspace"
                : action === "verify"
                  ? "Verify email"
                  : action === "reset"
                    ? "Save password"
                    : "Send recovery link"}
          </button>
        </form>
        <Link to="/login" className="inline-flex text-sm text-primary-600">
          Back to sign in →
        </Link>
        {request.data && <p role="status">{request.data.message}</p>}
        {request.error && <p role="alert">{apiError(request.error)}</p>}
      </div>
    </main>
  );
}
