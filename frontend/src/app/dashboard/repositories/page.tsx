"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, ExternalLink, Circle, Plus, AlertCircle, Loader2, Search, X, CheckCircle2, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import { apiGet, apiPost } from "@/lib/api";

const GitHubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  Ruby: "#701516",
};

export default function RepositoriesPage() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasToken, setHasToken] = useState(false);
  const [githubUser, setGithubUser] = useState<any>(null);

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  const [connectingRepo, setConnectingRepo] = useState<string | null>(null);

  useEffect(() => {
    // Check local storage for token
    const token = localStorage.getItem("github_access_token");
    const user = localStorage.getItem("github_user");
    
    if (token) setHasToken(true);
    if (user) {
      try {
        setGithubUser(JSON.parse(user));
      } catch (e) {}
    }

    fetchConnectedRepos();
  }, []);

  const fetchConnectedRepos = async () => {
    setLoading(true);
    try {
      const data = await apiGet<any[]>("/repositories");
      setRepos(data);
    } catch (err) {
      console.error("Failed to fetch repos", err);
      // Don't show critical errors if it's just empty
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubAuth = async () => {
    try {
      const resp = await apiGet<{ authorization_url: string; state: string }>("/auth/github");
      // Redirect to GitHub OAuth
      window.location.href = resp.authorization_url;
    } catch (err) {
      console.error("Failed to initiate OAuth", err);
      setError("Failed to reach GitHub authentication service.");
    }
  };

  const openConnectModal = async () => {
    setShowConnectModal(true);
    setGithubLoading(true);
    setGithubError(null);
    try {
      const token = localStorage.getItem("github_access_token");
      const resp = await apiGet<any[]>(`/repositories/github?access_token=${token}`);
      setGithubRepos(resp);
    } catch (err) {
      console.error("Failed to fetch github repos", err);
      setGithubError("Could not load your GitHub repositories. Token may be expired.");
      if (err instanceof Error && err.message.includes("401")) {
         // Auto-logout if unauthorized
         localStorage.removeItem("github_access_token");
         setHasToken(false);
      }
    } finally {
      setGithubLoading(false);
    }
  };

  const connectRepo = async (fullName: string) => {
    setConnectingRepo(fullName);
    try {
      const token = localStorage.getItem("github_access_token");
      await apiPost("/repositories/connect", {
        github_repo_full_name: fullName,
        access_token: token
      });
      // Refresh connected
      await fetchConnectedRepos();
      setShowConnectModal(false);
    } catch (err: any) {
      console.error("Failed to connect repo", err);
      setGithubError(err.message || "Failed to connect repository");
    } finally {
      setConnectingRepo(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <GitBranch size={24} className="text-[var(--color-accent)]" />
            Repositories
          </h1>
          <p className="text-sm text-white/40 mt-1">Manage AI code review targets</p>
        </div>
        
        <div className="flex items-center gap-3">
          {githubUser && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <img src={githubUser.avatar_url} alt="Profile" className="w-5 h-5 rounded-full" />
              <span className="text-xs text-white/80 font-medium">{githubUser.login}</span>
            </div>
          )}
          
          {!hasToken ? (
            <motion.button 
              whileHover={{ scale: 1.03 }} 
              whileTap={{ scale: 0.97 }} 
              onClick={handleGitHubAuth}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black hover:bg-white/90 text-sm font-bold transition-colors"
            >
              <GitHubIcon size={16} />
              Sign in with GitHub
            </motion.button>
          ) : (
            <motion.button 
              whileHover={{ scale: 1.03 }} 
              whileTap={{ scale: 0.97 }} 
              onClick={openConnectModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-light)] transition-colors"
            >
              <Plus size={16} />
              Add Repository
            </motion.button>
          )}
        </div>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-[var(--color-critical)]/30 flex items-center gap-3">
          <AlertCircle size={18} className="text-[var(--color-critical)] shrink-0" />
          <p className="text-sm text-white/80">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
           <Loader2 size={32} className="animate-spin text-white/20" />
        </div>
      ) : repos.length === 0 ? (
        <div className="glass rounded-xl p-16 flex flex-col items-center justify-center text-center">
          <GitBranch size={48} className="text-white/10 mb-4" />
          <h3 className="text-lg font-medium text-white/90">No repositories hooked up</h3>
          <p className="text-sm text-white/40 mt-1 max-w-sm">Connect a GitHub repository to automatically analyze pull requests and secure your codebase.</p>
          {!hasToken ? (
            <button onClick={handleGitHubAuth} className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium">
              <GitHubIcon size={16} /> Authenticate GitHub
            </button>
          ) : (
             <button onClick={openConnectModal} className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-accent)]/20 text-[var(--color-accent-light)] hover:bg-[var(--color-accent)]/30 transition-colors text-sm font-medium border border-[var(--color-accent)]/30">
               <Plus size={16} /> Connect your first repo
             </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo, i) => (
            <motion.div 
              key={repo.id} 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }} 
              whileHover={{ y: -2, scale: 1.01 }} 
              className="glass rounded-xl p-5 cursor-pointer flex flex-col group relative overflow-hidden"
            >
              {/* Internal glow for active tracking */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-accent)]/10 blur-[40px] rounded-full pointer-events-none" />

              <div className="flex items-start justify-between mb-4 relative">
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-[var(--color-accent-light)] transition-colors">{repo.name}</h3>
                  <p className="text-xs text-white/40 font-mono mt-0.5">{repo.full_name}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#2ed573]/10 text-[#2ed573] flex items-center justify-center shrink-0 border border-[#2ed573]/20">
                  <ShieldCheck size={14} />
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-white/50">
                <span className="flex items-center gap-1.5 font-medium">
                  <Circle size={8} fill={LANG_COLORS[repo.language || "Python"] || "#666"} stroke="none" />
                  {repo.language || "Unknown"}
                </span>
                <span className="flex items-center gap-1 group-hover:text-white/80 transition-colors">
                  Tracking active <CheckCircle2 size={12} className="text-[#2ed573] ml-1" />
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Connect Modal */}
      <AnimatePresence>
        {showConnectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowConnectModal(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-2xl bg-[#14151a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between flex-shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-white">Import from GitHub</h2>
                  <p className="text-xs text-white/40">Select a repository to begin monitoring</p>
                </div>
                <button onClick={() => setShowConnectModal(false)} className="text-white/40 hover:text-white p-2 rounded-full hover:bg-white/5">
                  <X size={20} />
                </button>
              </div>

              {githubError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-[var(--color-critical)]/10 border border-[var(--color-critical)]/20 flex gap-2">
                  <AlertCircle size={16} className="text-[var(--color-critical)] mt-0.5 shrink-0" />
                  <p className="text-sm text-[var(--color-critical)]">{githubError}</p>
                </div>
              )}

              <div className="p-6 overflow-y-auto flex-1">
                {githubLoading ? (
                  <div className="py-12 flex items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-[var(--color-accent)]" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {githubRepos.length === 0 ? (
                      <p className="text-center text-sm text-white/40 py-8">No repositories found attached to you.</p>
                    ) : (
                      githubRepos.map((r) => {
                        const isConnected = repos.some(connected => connected.full_name === r.full_name);
                        const isConnecting = connectingRepo === r.full_name;

                        return (
                          <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                            <div className="min-w-0 pr-4">
                              <div className="flex items-center gap-2">
                                <GitHubIcon size={14} />
                                <span className="text-sm font-medium text-white/90 truncate">{r.full_name}</span>
                                {r.private && <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/10 text-white/40 uppercase">Private</span>}
                              </div>
                              <span className="text-xs text-white/30 flex items-center gap-1.5 mt-1">
                                <Circle size={6} fill={LANG_COLORS[r.language] || "#666"} stroke="none" />
                                {r.language || "Unknown"}
                              </span>
                            </div>

                            {isConnected ? (
                              <button disabled className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2ed573]/10 text-[#2ed573] flex items-center gap-1 shrink-0">
                                <CheckCircle2 size={12} /> Connected
                              </button>
                            ) : (
                              <button 
                                onClick={() => connectRepo(r.full_name)}
                                disabled={connectingRepo !== null}
                                className={clsx(
                                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shrink-0",
                                  isConnecting 
                                    ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] opacity-70 cursor-wait"
                                    : "bg-white/10 hover:bg-white/20 text-white"
                                )}
                              >
                                {isConnecting ? <Loader2 size={12} className="animate-spin" /> : "Connect"}
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
