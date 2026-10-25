import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { ArrowRight, Check, MailCheck, RotateCw } from "lucide-react";
import api from "../services/api";
import "./OtpVerify.css";

const LENGTH = 6;
const RESEND_SECONDS = 60;

type Props = {
  email: string;
  expiresInSeconds: number;
  onVerified: () => void;
  onSkip: () => void;
};

// Six single-digit boxes that behave like one field: typing advances, backspace goes back,
// and pasting a full code fills every box and submits.
export default function OtpVerify({
  email,
  expiresInSeconds,
  onVerified,
  onSkip,
}: Props) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "checking" | "error" | "done">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [expiresAt, setExpiresAt] = useState(
    () => Date.now() + expiresInSeconds * 1000,
  );
  const [now, setNow] = useState(Date.now());
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputs.current[0]?.focus();
    const tick = setInterval(() => {
      setNow(Date.now());
      setResendIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const remaining = Math.max(0, Math.round((expiresAt - now) / 1000));
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  async function verify(code: string) {
    setStatus("checking");
    setMessage(null);
    try {
      await api.post("/auth/otp/verify", {
        email,
        purpose: "email-verification",
        code,
      });
      setStatus("done");
      setTimeout(onVerified, 900);
    } catch (error: any) {
      setStatus("error");
      setMessage(
        error.response?.data?.error || "That code did not work. Try again.",
      );
      setDigits(Array(LENGTH).fill(""));
      setTimeout(() => inputs.current[0]?.focus(), 0);
    }
  }

  function update(next: string[]) {
    setDigits(next);
    if (status === "error") setStatus("idle");
    if (next.every(Boolean)) void verify(next.join(""));
  }

  function onChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    if (digit && index < LENGTH - 1) inputs.current[index + 1]?.focus();
    update(next);
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
    } else if (e.key === "ArrowLeft" && index > 0)
      inputs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < LENGTH - 1)
      inputs.current[index + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const code = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH);
    if (!code) return;
    e.preventDefault();
    const next = Array.from({ length: LENGTH }, (_, i) => code[i] ?? "");
    inputs.current[Math.min(code.length, LENGTH - 1)]?.focus();
    update(next);
  }

  async function resend() {
    setMessage(null);
    try {
      const { data } = await api.post("/auth/otp/request", {
        email,
        purpose: "email-verification",
      });
      setExpiresAt(Date.now() + (data.expiresInSeconds ?? 600) * 1000);
      setMessage("Code sent again. Check your inbox.");
    } catch (error: any) {
      setMessage(error.response?.data?.error || "Could not resend the code.");
    }
    setResendIn(RESEND_SECONDS);
  }

  return (
    <div className={`otp-verify otp-${status}`}>
      <div className="otp-icon" aria-hidden="true">
        {status === "done" ? (
          <Check size={26} strokeWidth={3} />
        ) : (
          <MailCheck size={26} />
        )}
      </div>
      <p className="login-form-eyebrow">ONE LAST STEP</p>
      <h2 className="text-3xl font-semibold text-white">
        {status === "done" ? "You’re verified!" : "Check your email"}
      </h2>
      <p className="text-surface-500 text-sm mt-3 mb-8">
        We sent a 6-digit code to{" "}
        <strong className="text-surface-200">{email}</strong>.
      </p>
      <div
        className="otp-boxes"
        role="group"
        aria-label="Verification code"
        aria-describedby="otp-status"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            className={`otp-box ${digit ? "filled" : ""}`}
            style={{ animationDelay: `${i * 45}ms` }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={digit}
            aria-label={`Digit ${i + 1}`}
            disabled={status === "checking" || status === "done"}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
          />
        ))}
      </div>
      <p
        id="otp-status"
        className="otp-meta"
        role={status === "error" ? "alert" : "status"}
      >
        {status === "checking"
          ? "Checking…"
          : status === "done"
            ? "Email confirmed. Taking you to your workspace…"
            : (message ??
              (remaining > 0 ? (
                <>
                  Code expires in <span className="otp-clock">{clock}</span>
                </>
              ) : (
                "This code has expired. Request a new one."
              )))}
      </p>
      <div className="otp-actions">
        <button
          type="button"
          className="btn-ghost"
          disabled={resendIn > 0 || status === "done"}
          onClick={resend}
        >
          <RotateCw size={15} aria-hidden="true" />
          {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onSkip}
          disabled={status === "done"}
        >
          Verify later <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
