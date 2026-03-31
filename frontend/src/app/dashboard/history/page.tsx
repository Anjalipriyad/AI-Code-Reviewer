"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { History, Filter, Search, Loader2, WifiOff, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet, type ReviewBrief, type PaginatedResponse } from "@/lib/api";
import clsx from "clsx";

/* ═════════════════════════════════════════════════════════════
   Review History — Dynamic Data from /history API
   ═════════════════════════════════════════════════════════════ */

const SEVERITY_CLASS: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
  info: "severity-info",
};

const SEVERITY_OPTIONS = ["critical", "high", "medium", "low", "info"];
const CATEGORY_OPTIONS = ["security", "bug_risk", "performance", "code_smell", "style", "best_practice"];

export default function HistoryPage() {
  const [findings, setFindings] = useState<ReviewBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      if (severityFilter) params.severity = severityFilter;
      if (categoryFilter) params.category = categoryFilter;

      const data = await apiGet<PaginatedResponse<ReviewBrief>>("/history", params);
      setFindings(data.items);
      setTotalPages(data.total_pages);
      setTotal(data.total);
    } catch (e) {
      console.error("History fetch error:", e);
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, severityFilter, categoryFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [severityFilter, categoryFilter]);

  // Client-side search filter (on top of API filters)
  const filteredFindings = searchQuery.trim()
    ? findings.filter(
        (f) =>
          f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.file_path.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : findings;

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <History size={24} className="text-[var(--color-accent)]" />
            Review History
          </h1>
          <p className="text-sm text-white/40 mt-1">
            {total > 0 ? `${total} findings across all reviews` : "Past AI review findings across all repositories"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Search findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-white/80 placeholder-white/25 outline-none focus:border-[var(--color-accent)]/50 transition-colors w-64"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors",
              showFilters
                ? "bg-[var(--color-accent)]/20 border-[var(--color-accent)]/50 text-[var(--color-accent-light)]"
                : "bg-[var(--color-surface)] border-[var(--color-border)] text-white/60 hover:text-white/80"
            )}
          >
            <Filter size={14} />
            Filters
            {(severityFilter || categoryFilter) && (
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
            )}
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="glass rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Severity:</span>
              <button
                onClick={() => setSeverityFilter(null)}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                  !severityFilter ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                )}
              >
                All
              </button>
              {SEVERITY_OPTIONS.map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-xs font-semibold uppercase transition-all",
                    severityFilter === sev ? `severity-${sev}` : "text-white/30 hover:text-white/60"
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Category:</span>
              <button
                onClick={() => setCategoryFilter(null)}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                  !categoryFilter ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                )}
              >
                All
              </button>
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-all",
                    categoryFilter === cat ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                  )}
                >
                  {cat.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Error Banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-xl p-4 border border-[var(--color-critical)]/30 flex items-center gap-3"
        >
          <WifiOff size={18} className="text-[var(--color-critical)] shrink-0" />
          <div>
            <p className="text-sm text-white/80">Could not load review history</p>
            <p className="text-xs text-white/40 mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchHistory}
            className="ml-auto text-xs text-[var(--color-accent-light)] hover:text-white transition-colors shrink-0"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Severity
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors"
                onClick={() => handleSort("file_path")}
              >
                Finding {sortBy === "file_path" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                File
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                Category
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors"
                onClick={() => handleSort("confidence_score")}
              >
                Confidence {sortBy === "confidence_score" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th
                className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60 transition-colors"
                onClick={() => handleSort("created_at")}
              >
                Date {sortBy === "created_at" && (sortOrder === "asc" ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading ? (
              // Skeleton rows
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-3"><div className="w-16 h-4 rounded-full bg-white/5" /></td>
                  <td className="px-5 py-3"><div className="w-40 h-4 rounded bg-white/5" /></td>
                  <td className="px-5 py-3"><div className="w-32 h-3 rounded bg-white/5" /></td>
                  <td className="px-5 py-3"><div className="w-20 h-3 rounded bg-white/5" /></td>
                  <td className="px-5 py-3"><div className="w-20 h-3 rounded bg-white/5" /></td>
                  <td className="px-5 py-3"><div className="w-20 h-3 rounded bg-white/5" /></td>
                </tr>
              ))
            ) : filteredFindings.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <History size={32} className="mx-auto text-white/10 mb-3" />
                  <p className="text-sm text-white/30">No findings found</p>
                  <p className="text-xs text-white/20 mt-1">
                    {severityFilter || categoryFilter
                      ? "Try adjusting your filters"
                      : "Run an analysis to see review history here"}
                  </p>
                </td>
              </tr>
            ) : (
              filteredFindings.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLASS[row.severity] || "severity-info"}`}
                    >
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-white/80">{row.title}</td>
                  <td className="px-5 py-3 text-xs text-white/40 font-mono">{row.file_path}</td>
                  <td className="px-5 py-3 text-xs text-white/50 capitalize">{row.category.replace("_", " ")}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${row.confidence_score * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-white/40 font-mono">
                        {Math.round(row.confidence_score * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-white/30">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : "—"}
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-white/30">
            Page {page} of {totalPages} · {total} total findings
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass text-xs text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg glass text-xs text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
