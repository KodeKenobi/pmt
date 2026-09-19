"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const inviteToken = searchParams.get("token");

    if (!inviteToken) {
      setError("Invalid invite link. Please request a new invitation.");
      setValidating(false);
      return;
    }

    setToken(inviteToken);

    void (async () => {
      try {
        const res = await fetch(
          `/api/auth/invite?token=${encodeURIComponent(inviteToken)}`,
        );
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            typeof body.error === "string"
              ? body.error
              : "Failed to validate invitation",
          );
        }

        setEmail(typeof body.email === "string" ? body.email : "");
        setRole(typeof body.role === "string" ? body.role : "");
        setName(typeof body.email === "string" ? body.email.split("@")[0] : "");
        setTokenValid(true);
      } catch (validationError) {
        setError(
          validationError instanceof Error
            ? validationError.message
            : "Failed to validate invitation",
        );
      } finally {
        setValidating(false);
      }
    })();
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name.trim() }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Failed to accept invitation",
        );
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.replace(
          role === "CLIENT" ? "/client/dashboard" : "/dashboard",
        );
      }, 1200);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to accept invitation",
      );
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div
        className="min-h-screen relative overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage: "url('/login-bg.svg')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute w-[400px] h-[400px] bg-sky-500/30 rounded-full blur-[120px] top-[-100px] left-[-100px]" />
        <div className="absolute w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-[120px] bottom-[-100px] right-[-100px]" />
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md px-6 sm:px-8 lg:px-12">
            <div className="relative z-10 w-full bg-black/60 backdrop-blur-sm border border-white/12 shadow-xl rounded-2xl p-8 text-center">
              <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-white" />
              <p className="text-sm text-gray-200">Validating invitation...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div
        className="min-h-screen relative overflow-hidden bg-cover bg-center"
        style={{
          backgroundImage: "url('/login-bg.svg')",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute w-[400px] h-[400px] bg-sky-500/30 rounded-full blur-[120px] top-[-100px] left-[-100px]" />
        <div className="absolute w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-[120px] bottom-[-100px] right-[-100px]" />
        <div className="flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md px-6 sm:px-8 lg:px-12">
            <div className="relative z-10 w-full bg-black/60 backdrop-blur-sm border border-white/12 shadow-xl rounded-2xl p-8 text-center">
              <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
              <h1 className="mb-2 text-2xl font-semibold text-white">
                Invalid Invitation
              </h1>
              <p className="mb-6 text-sm text-gray-300">{error}</p>
              <button
                type="button"
                onClick={() => router.replace("/auth/login")}
                className="w-full py-3 bg-[var(--color-brand-600)] text-white text-base font-semibold rounded-lg shadow-md transition"
              >
                Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-cover bg-center"
      style={{
        backgroundImage: "url('/login-bg.svg')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute w-[400px] h-[400px] bg-sky-500/30 rounded-full blur-[120px] top-[-100px] left-[-100px]" />
      <div className="absolute w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-[120px] bottom-[-100px] right-[-100px]" />

      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md px-6 sm:px-8 lg:px-12">
          <div className="relative z-10 w-full bg-black/60 backdrop-blur-sm border border-white/12 shadow-xl rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6 justify-center">
              <div className="text-white text-2xl font-medium">
                Lighthouse Project Management
              </div>
            </div>

            {success ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm">
                Account activated. Redirecting...
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-6">
                  Set your password to activate your account.
                </p>

                {error ? (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="text-red-700 text-sm">{error}</span>
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-200 mb-2 font-thin">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-10 pr-3 py-3 rounded-lg bg-black/30 text-white placeholder-gray-400 border border-white/12 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition text-base font-thin"
                        placeholder="Your full name"
                        autoComplete="name"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-200 mb-2 font-thin">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                      <input
                        type="email"
                        value={email}
                        disabled
                        className="w-full pl-10 pr-3 py-3 rounded-lg bg-black/20 text-gray-300 border border-white/12 outline-none text-base font-thin cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-200 mb-2 font-thin">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 rounded-lg bg-black/30 text-white placeholder-gray-400 border border-white/12 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition text-base font-thin"
                        placeholder="Create password"
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-200 mb-2 font-thin">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 rounded-lg bg-black/30 text-white placeholder-gray-400 border border-white/12 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition text-base font-thin"
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((value) => !value)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={cn(
                      "w-full py-3 bg-[var(--color-brand-600)] text-white text-base font-semibold rounded-lg shadow-md transition",
                      loading && "opacity-70 cursor-not-allowed",
                    )}
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Activating...
                      </span>
                    ) : (
                      "Set password and continue"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <InviteContent />
    </Suspense>
  );
}
