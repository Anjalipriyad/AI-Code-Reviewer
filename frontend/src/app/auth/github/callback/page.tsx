"use client";

import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { apiGet } from "@/lib/api";

interface OAuthCallbackResponse {
  access_token: string;
  user: {
    id: number;
    login: string;
    email: string | null;
    name: string | null;
    avatar_url: string | null;
  };
}

export default function GitHubCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Ref to prevent double-firing in React Strict Mode
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      // If there's no code/state, maybe we directly navigated here by mistake.
      // We will just stall or show an error.
      setTimeout(() => {
        if (!processedRef.current) {
          setStatus("error");
          setErrorMsg("Missing authorization code or state from GitHub.");
        }
      }, 1000);
      return;
    }

    processedRef.current = true;
    exchangeToken(code, state);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const exchangeToken = async (code: string, state: string) => {
    try {
      const response = await apiGet<OAuthCallbackResponse>("/auth/github/callback", {
        code,
        state,
      });

      // Save token
      localStorage.setItem("github_access_token", response.access_token);
      
      // Save user profile for UI
      if (response.user) {
        localStorage.setItem("github_user", JSON.stringify(response.user));
      }

      setStatus("success");
      
      // Redirect back to repositories page after a brief delay
      setTimeout(() => {
        router.replace("/dashboard/repositories");
      }, 1500);
      
    } catch (err) {
      console.error("Failed to exchange GitHub token:", err);
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Authentication failed.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0e12] text-white p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-2xl p-8 max-w-sm w-full text-center space-y-4"
      >
        {status === "loading" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <Loader2 size={40} className="animate-spin text-[var(--color-accent)] mb-4" />
            <h2 className="text-xl font-bold tracking-tight">Authenticating...</h2>
            <p className="text-sm text-white/50 mt-2">Connecting your GitHub account</p>
          </motion.div>
        )}

        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#2ed573]/20 text-[#2ed573] flex items-center justify-center mb-4">
              <ShieldCheck size={32} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Success!</h2>
            <p className="text-sm text-white/50 mt-2">Redirecting to your repositories...</p>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--color-critical)]/20 text-[var(--color-critical)] flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Authentication Failed</h2>
            <p className="text-sm text-[var(--color-critical)]/80 mt-2">{errorMsg}</p>
            <button
              onClick={() => router.push("/dashboard/repositories")}
              className="mt-6 px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
            >
              Return Home
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
