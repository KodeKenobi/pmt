"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { Mail, Lock, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteActivated, setInviteActivated] = useState(false);
  const { login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const emailFromInvite = searchParams.get("email");
    if (emailFromInvite) {
      setEmail(emailFromInvite.trim().toLowerCase());
    }
  }, [searchParams]);

  useEffect(() => {
    const inviteToken = searchParams.get("inviteToken");

    if (!inviteToken || inviteActivated) {
      return;
    }

    void (async () => {
      try {
        await fetch("/api/auth/invite/activate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token: inviteToken }),
        });
      } catch (activationError) {
        console.warn("Invite activation ping failed", activationError);
      } finally {
        setInviteActivated(true);
      }
    })();
  }, [searchParams, inviteActivated]);

  useEffect(() => {
    if (user) {
      router.replace(
        user.role === "CLIENT" ? "/client/dashboard" : "/dashboard",
      );
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unexpected error. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

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
      {/* Background blur orbs */}
      <div className="absolute w-[400px] h-[400px] bg-sky-500/30 rounded-full blur-[120px] top-[-100px] left-[-100px]"></div>
      <div className="absolute w-[400px] h-[400px] bg-blue-500/30 rounded-full blur-[120px] bottom-[-100px] right-[-100px]"></div>

      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md px-6 sm:px-8 lg:px-12 h-full flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, x: 0, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative z-10 w-full bg-[#05172C] border border-gray-700 shadow-xl rounded-2xl p-8"
          >
            <div className="mb-6 flex justify-center">
              <Image
                src="/lighthouse-logo.png"
                alt="Lighthouse Project Management"
                width={200}
                height={200}
                priority
                className="h-auto w-44"
              />
            </div>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 text-sm">{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm text-gray-200 mb-2 font-thin"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 rounded-lg bg-black/30 text-white placeholder-gray-400 border border-white/12 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition text-base font-thin"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm text-gray-200 mb-2 font-thin"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4 pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 rounded-lg bg-black/30 text-white placeholder-gray-400 border border-white/12 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 outline-none transition text-base font-thin"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-200 transition"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  "w-full py-3 bg-[var(--color-brand-600)] text-white text-base font-semibold rounded-lg shadow-md hover:from-sky-700 hover:to-indigo-900 transition",
                  loading && "opacity-70 cursor-not-allowed",
                )}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing in...
                  </span>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
