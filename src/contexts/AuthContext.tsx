"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  teamId?: string | null;
  /** null when super admin (all teams); array for scoped employees */
  teamIds?: string[] | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  completePasswordlessLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
      }
    } catch (error) {
      console.error("Auth check error:", error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      throw new Error("Email and password are required");
    }

    // First, authenticate with Supabase
    const { data: supabaseData, error: supabaseError } =
      await supabaseClient.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (supabaseError || !supabaseData.session?.access_token) {
      console.error("Supabase login failed", {
        status: supabaseError?.status,
        code: supabaseError?.code,
        message: supabaseError?.message,
      });
      throw new Error(supabaseError?.message || "Login failed");
    }

    // Then, exchange the access token for a session on our backend
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: supabaseData.session.access_token }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Backend session exchange failed", {
        status: response.status,
        error,
      });
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
  };

  const completePasswordlessLogin = async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const typeParam = url.searchParams.get("type");

    if (code) {
      const { error: exchangeError } =
        await supabaseClient.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        throw new Error(exchangeError.message || "Magic link is invalid.");
      }
    } else if (tokenHash && typeParam) {
      const allowedTypes: EmailOtpType[] = [
        "magiclink",
        "email",
        "recovery",
        "invite",
        "email_change",
      ];

      if (!allowedTypes.includes(typeParam as EmailOtpType)) {
        throw new Error("Unsupported magic link type.");
      }

      const { error: verifyError } = await supabaseClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: typeParam as EmailOtpType,
      });

      if (verifyError) {
        throw new Error(verifyError.message || "Magic link is invalid.");
      }
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Sign-in session not found. Request a new magic link.");
    }

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: session.access_token }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await supabaseClient.auth.signOut();
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    } catch (error) {
      console.error("Logout error:", error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, completePasswordlessLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
