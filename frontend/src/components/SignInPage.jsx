import { useState } from "react";
import logo from "../assets/Logo.png";
import posterImg from "../assets/poster-login.png";
import { login, signUp, confirmSignUp, forgotPassword, confirmForgotPassword } from "../auth/cognito";

// Screens: "signin" | "signup" | "confirm" | "forgot" | "reset"
const SignInPage = ({ onSignIn }) => {
  const [screen, setScreen] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const goTo = (s) => { setScreen(s); setError(""); setSuccessMsg(""); };

  // ── Sign In ────────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      onSignIn(email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Sign Up ────────────────────────────────────────────────────────────────
  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signUp(email.trim(), password);
      goTo("confirm");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm signup OTP ─────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!confirmCode.trim()) {
      setError("Please enter the 6-digit code from your email.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await confirmSignUp(email.trim(), confirmCode.trim());
      goTo("signin");
      setPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password: send OTP ──────────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      goTo("reset");
      setSuccessMsg(`A reset code was sent to ${email.trim()}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset Password: confirm OTP + new password ────────────────────────────
  const handleResetPassword = async () => {
    if (!resetCode.trim() || !newPassword.trim()) {
      setError("Please fill in both the code and new password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await confirmForgotPassword(email.trim(), resetCode.trim(), newPassword);
      goTo("signin");
      setPassword("");
      setSuccessMsg("Password reset successfully. Please sign in.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Shared layout wrapper ──────────────────────────────────────────────────
  return (
    <div className="h-screen overflow-hidden flex" style={{ backgroundColor: "#f8f9fa" }}>

      {/* LEFT — poster */}
      <div className="flex-1 hidden md:block relative overflow-hidden border-r border-gray-200">
        <img
          src={posterImg}
          alt="AI Growth Strategist"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      </div>

      {/* RIGHT — form panel */}
      <div className="w-full md:w-[440px] h-full flex flex-col justify-center px-10 bg-white overflow-y-auto">

        {/* Logo */}
        <div className="flex items-center gap-0 mb-10 h-14 overflow-visible">
          <img src={logo} alt="Logo" className="h-32 w-auto object-contain" />
          <span className="text-xl font-bold text-gray-800 tracking-tight">
            AI Growth Strategist
          </span>
        </div>

        {/* ── SIGN IN ── */}
        {screen === "signin" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h1>
              <p className="text-sm text-gray-600 mt-1">Sign in to access your intelligence dashboard.</p>
            </div>
            <div className="space-y-4">
              <Field label="Email" type="email" value={email} onChange={setEmail}
                onEnter={handleSignIn} placeholder="you@example.com" />
              <div>
                <Field label="Password" type="password" value={password} onChange={setPassword}
                  onEnter={handleSignIn} placeholder="Enter your password" />
                <button
                  type="button"
                  onClick={() => goTo("forgot")}
                  className="mt-1.5 text-xs text-indigo-600 hover:underline float-right"
                >
                  Forgot Password?
                </button>
                <div className="clear-both" />
              </div>

              {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

              <div className="flex gap-3 pt-1">
                <PrimaryBtn onClick={handleSignIn} loading={loading} label="Sign In" loadingLabel="Signing in..." />
                <SecondaryBtn onClick={() => goTo("signup")} label="Sign Up" />
              </div>
            </div>
          </>
        )}

        {/* ── SIGN UP ── */}
        {screen === "signup" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create account</h1>
              <p className="text-sm text-gray-600 mt-1">Enter your email and choose a password.</p>
            </div>
            <div className="space-y-4">
              <Field label="Email" type="email" value={email} onChange={setEmail}
                placeholder="you@example.com" />
              <Field label="Password" type="password" value={password} onChange={setPassword}
                placeholder="Min 8 chars, upper + lower + number" />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
              <div className="flex gap-3 pt-1">
                <PrimaryBtn onClick={handleSignUp} loading={loading} label="Create Account" loadingLabel="Creating account..." />
                <SecondaryBtn onClick={() => goTo("signin")} label="Back" />
              </div>
            </div>
          </>
        )}

        {/* ── CONFIRM SIGNUP ── */}
        {screen === "confirm" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Check your email</h1>
              <p className="text-sm text-gray-600 mt-1">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below.
              </p>
            </div>
            <div className="space-y-4">
              <Field label="Verification Code" type="text" value={confirmCode} onChange={setConfirmCode}
                onEnter={handleConfirm} placeholder="123456" maxLength={6} />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
              <PrimaryBtn onClick={handleConfirm} loading={loading} label="Verify & Continue" loadingLabel="Verifying..." full />
            </div>
          </>
        )}

        {/* ── FORGOT PASSWORD: enter email ── */}
        {screen === "forgot" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reset your password</h1>
              <p className="text-sm text-gray-600 mt-1">
                Enter your account email and we'll send you a reset code.
              </p>
            </div>
            <div className="space-y-4">
              <Field label="Email" type="email" value={email} onChange={setEmail}
                onEnter={handleForgotPassword} placeholder="you@example.com" />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
              <div className="flex gap-3 pt-1">
                <PrimaryBtn onClick={handleForgotPassword} loading={loading} label="Send Reset Code" loadingLabel="Sending..." />
                <SecondaryBtn onClick={() => goTo("signin")} label="Back" />
              </div>
            </div>
          </>
        )}

        {/* ── RESET PASSWORD: enter OTP + new password ── */}
        {screen === "reset" && (
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Set new password</h1>
              <p className="text-sm text-gray-600 mt-1">
                Enter the code sent to <strong>{email}</strong> and choose a new password.
              </p>
            </div>
            <div className="space-y-4">
              {successMsg && <p className="text-xs text-green-600 font-medium">{successMsg}</p>}
              <Field label="Reset Code" type="text" value={resetCode} onChange={setResetCode}
                placeholder="6-digit code from email" maxLength={6} />
              <Field label="New Password" type="password" value={newPassword} onChange={setNewPassword}
                onEnter={handleResetPassword} placeholder="Min 8 chars, upper + lower + number" />
              {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
              <div className="flex gap-3 pt-1">
                <PrimaryBtn onClick={handleResetPassword} loading={loading} label="Reset Password" loadingLabel="Resetting..." />
                <SecondaryBtn onClick={() => goTo("forgot")} label="Resend Code" />
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

// ── Small reusable sub-components (local only, not exported) ─────────────────

function Field({ label, type, value, onChange, onEnter, placeholder, maxLength }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onEnter ? (e) => e.key === "Enter" && onEnter() : undefined}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
      />
    </div>
  );
}

function PrimaryBtn({ onClick, loading, label, loadingLabel, full }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`${full ? "w-full" : "flex-[2]"} py-2.5 rounded-xl text-sm font-extrabold text-white border-2 border-[#4a8a4a] shadow-lg hover:shadow-xl hover:brightness-105 active:scale-95 transition-all tracking-wide disabled:opacity-60`}
      style={{ backgroundColor: "#5a9e5a" }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}

function SecondaryBtn({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 bg-white shadow-sm hover:shadow-md hover:bg-gray-50 active:scale-95 transition-all"
    >
      {label}
    </button>
  );
}

export default SignInPage;
