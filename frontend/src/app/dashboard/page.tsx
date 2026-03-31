"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  Code2,
  GitPullRequest,
  TrendingUp,
  Zap,
  Loader2,
  WifiOff,
} from "lucide-react";
import { apiGet, type ReviewStats, type ReviewBrief, type PaginatedResponse } from "@/lib/api";

/* ═════════════════════════════════════════════════════════════
   Dashboard Overview — Dynamic Stats Cards + Recent Findings
   ═════════════════════════════════════════════════════════════ */

const severityClass: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
  info: "severity-info",
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

/* ── Skeleton Loader ────────────────────────────────────────── */

function StatSkeleton() {
  return (
    <div className="glass rounded-xl p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="w-10 h-10 rounded-lg bg-white/5" />
        <div className="w-12 h-5 rounded-full bg-white/5" />
      </div>
      <div className="w-16 h-7 rounded bg-white/5 mb-1" />
      <div className="w-20 h-3 rounded bg-white/5 mt-2" />
    </div>
  );
}

function FindingSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
      <div className="w-2 h-2 rounded-full bg-white/10 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="w-48 h-4 rounded bg-white/5" />
        <div className="w-32 h-3 rounded bg-white/5" />
      </div>
      <div className="w-14 h-4 rounded-full bg-white/5" />
      <div className="w-16 h-3 rounded bg-white/5" />
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [recentFindings, setRecentFindings] = useState<ReviewBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [statsData, historyData] = await Promise.all([
          apiGet<ReviewStats>("/history/stats"),
          apiGet<PaginatedResponse<ReviewBrief>>("/history", {
            page_size: 5,
            sort_by: "created_at",
            sort_order: "desc",
          }),
        ]);
        setStats(statsData);
        setRecentFindings(historyData.items);
      } catch (e) {
        console.error("Dashboard fetch error:", e);
        setError(e instanceof Error ? e.message : "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  /* ── Build stats cards from API data ─────────────────────── */
  const STATS = stats
    ? [
        {
          label: "Total Reviews",
          value: stats.total_reviews.toLocaleString(),
          change: `${stats.critical + stats.high} critical/high`,
          icon: <Code2 size={20} />,
          color: "var(--color-accent)",
          bg: "rgba(108, 92, 231, 0.1)",
        },
        {
          label: "Security Issues",
          value: String(stats.critical + stats.high),
          change: `${stats.critical} critical`,
          icon: <Shield size={20} />,
          color: "var(--color-critical)",
          bg: "rgba(255, 71, 87, 0.1)",
        },
        {
          label: "Medium / Low",
          value: String(stats.medium + stats.low),
          change: `${stats.dismissed} dismissed`,
          icon: <GitPullRequest size={20} />,
          color: "var(--color-low)",
          bg: "rgba(52, 152, 219, 0.1)",
        },
        {
          label: "Avg Confidence",
          value: `${(stats.avg_confidence * 100).toFixed(1)}%`,
          change: `${stats.info} info`,
          icon: <TrendingUp size={20} />,
          color: "#2ed573",
          bg: "rgba(46, 213, 115, 0.1)",
        },
      ]
    : [];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-white/40 mt-1">
            AI-powered code analysis overview
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-light)] transition-colors"
          onClick={() => (window.location.href = "/dashboard/analyze")}
        >
          <Zap size={16} />
          New Analysis
        </motion.button>
      </motion.div>

      {/* Error Banner */}
      {error && (
        <motion.div variants={item} className="glass rounded-xl p-4 border border-[var(--color-critical)]/30 flex items-center gap-3">
          <WifiOff size={18} className="text-[var(--color-critical)] shrink-0" />
          <div>
            <p className="text-sm text-white/80">Could not connect to the backend</p>
            <p className="text-xs text-white/40 mt-0.5">Make sure the API server is running at {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005/api/v1"}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto text-xs text-[var(--color-accent-light)] hover:text-white transition-colors shrink-0"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : STATS.map((stat) => (
              <motion.div
                key={stat.label}
                whileHover={{ y: -2, scale: 1.01 }}
                className="glass rounded-xl p-5 cursor-default"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: stat.bg, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: stat.bg,
                      color: stat.color,
                    }}
                  >
                    {stat.change}
                  </span>
                </div>
                <p className="text-2xl font-bold text-white tracking-tight">
                  {stat.value}
                </p>
                <p className="text-xs text-white/40 mt-1">{stat.label}</p>
              </motion.div>
            ))}
      </motion.div>

      {/* Recent Findings */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Recent Findings
          </h2>
          <button
            onClick={() => (window.location.href = "/dashboard/history")}
            className="text-xs text-[var(--color-accent-light)] hover:text-[var(--color-accent)] transition-colors"
          >
            View all →
          </button>
        </div>
        <div className="glass rounded-xl divide-y divide-[var(--color-border)]">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <FindingSkeleton key={i} />)
          ) : recentFindings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Code2 size={32} className="text-white/10 mb-3" />
              <p className="text-sm text-white/30">No findings yet</p>
              <p className="text-xs text-white/20 mt-1">
                Run your first analysis to see results here
              </p>
            </div>
          ) : (
            recentFindings.map((finding, i) => (
              <motion.div
                key={finding.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer group"
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    background:
                      finding.severity === "critical"
                        ? "var(--color-critical)"
                        : finding.severity === "high"
                        ? "var(--color-high)"
                        : finding.severity === "medium"
                        ? "var(--color-medium)"
                        : "var(--color-low)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/90 truncate group-hover:text-white transition-colors">
                    {finding.title}
                  </p>
                  <p className="text-xs text-white/30 font-mono mt-0.5">
                    {finding.file_path}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${
                    severityClass[finding.severity] || "severity-info"
                  }`}
                >
                  {finding.severity}
                </span>
                <span className="text-xs text-white/25 whitespace-nowrap">
                  {finding.created_at
                    ? new Date(finding.created_at).toLocaleDateString()
                    : ""}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: <Code2 size={24} />,
            title: "Paste & Analyze",
            desc: "Paste code for instant AI review",
            href: "/dashboard/analyze",
          },
          {
            icon: <GitPullRequest size={24} />,
            title: "Connect Repository",
            desc: "Link GitHub repos for automatic reviews",
            href: "/dashboard/repositories",
          },
          {
            icon: <AlertTriangle size={24} />,
            title: "Security Audit",
            desc: "Deep security scan across all repos",
            href: "/dashboard/security",
          },
        ].map((action) => (
          <motion.a
            key={action.title}
            href={action.href}
            whileHover={{ y: -3, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="glass glass-hover rounded-xl p-5 cursor-pointer block"
          >
            <div className="text-[var(--color-accent-light)] mb-3">
              {action.icon}
            </div>
            <h3 className="text-sm font-semibold text-white">{action.title}</h3>
            <p className="text-xs text-white/40 mt-1">{action.desc}</p>
          </motion.a>
        ))}
      </motion.div>
    </motion.div>
  );
}
