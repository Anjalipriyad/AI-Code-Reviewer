"use client";

import React from "react";
import { motion } from "framer-motion";
import { GitBranch, ExternalLink, Circle } from "lucide-react";

const GitHubIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const REPOS = [
  { name: "ai-code-reviewer", fullName: "anjali/ai-code-reviewer", language: "Python", status: "active", lastSync: "2 min ago", reviews: 47, issues: 12 },
  { name: "ml-pipeline", fullName: "anjali/ml-pipeline", language: "Python", status: "active", lastSync: "1 hr ago", reviews: 124, issues: 3 },
  { name: "dashboard-ui", fullName: "anjali/dashboard-ui", language: "TypeScript", status: "active", lastSync: "3 hr ago", reviews: 89, issues: 7 },
  { name: "api-gateway", fullName: "anjali/api-gateway", language: "Go", status: "inactive", lastSync: "2 days ago", reviews: 201, issues: 0 },
];

const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Go: "#00ADD8",
  Rust: "#dea584",
};

export default function RepositoriesPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <GitBranch size={24} className="text-[var(--color-accent)]" />
            Repositories
          </h1>
          <p className="text-sm text-white/40 mt-1">Connected repositories for AI code review</p>
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium">
          <GitHubIcon size={16} />
          Connect Repository
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPOS.map((repo, i) => (
          <motion.div key={repo.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} whileHover={{ y: -2 }} className="glass rounded-xl p-5 cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white group-hover:text-[var(--color-accent-light)] transition-colors">{repo.name}</h3>
                <p className="text-xs text-white/30 font-mono mt-0.5">{repo.fullName}</p>
              </div>
              <ExternalLink size={14} className="text-white/20 group-hover:text-white/50 transition-colors" />
            </div>
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><Circle size={8} fill={LANG_COLORS[repo.language] || "#666"} stroke="none" />{repo.language}</span>
              <span>{repo.reviews} reviews</span>
              <span>{repo.issues} issues</span>
              <span className="ml-auto">{repo.lastSync}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
