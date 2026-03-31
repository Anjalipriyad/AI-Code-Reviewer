"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  WifiOff,
  ChevronRight,
  ChevronLeft,
  X,
  Wrench,
  Check,
  Copy,
  GitBranch
} from "lucide-react";
import clsx from "clsx";
import { apiGet, apiPost, type ReviewBrief, type PaginatedResponse, type FixPatchResponse, type ReviewStats } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "var(--color-critical)",
  high: "var(--color-high)",
  medium: "var(--color-medium)",
  low: "var(--color-low)",
  info: "var(--color-info)",
};

const SEVERITY_CLASSES: Record<string, string> = {
  critical: "severity-critical",
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
  info: "severity-info",
};

const containerV = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemV = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

export default function SecurityPage() {
  const [findings, setFindings] = useState<ReviewBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<ReviewStats | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  // Selection
  const [selectedFinding, setSelectedFinding] = useState<ReviewBrief | null>(null);
  
  // Patch gen
  const [patch, setPatch] = useState<string | null>(null);
  const [generatingPatch, setGeneratingPatch] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fetch logic
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyData, statsData] = await Promise.all([
        apiGet<PaginatedResponse<ReviewBrief>>("/history", {
          category: "security",
          page,
          page_size: pageSize,
          sort_by: "severity",
          sort_order: "asc", 
        }),
        apiGet<ReviewStats>("/history/stats")
      ]);
      setFindings(historyData.items);
      setTotalPages(historyData.total_pages);
      setTotal(historyData.total);
      setStats(statsData);
    } catch (e) {
      console.error("Security fetch error:", e);
      setError(e instanceof Error ? e.message : "Failed to load security audit");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGeneratePatch = async () => {
    if (!selectedFinding) return;
    setGeneratingPatch(true);
    try {
      const language = selectedFinding.file_path.endsWith(".py") ? "python" : 
                       selectedFinding.file_path.endsWith(".ts") ? "typescript" : "javascript";
      
      const response = await apiPost<FixPatchResponse>("/fix", {
        code: `# File: ${selectedFinding.file_path}\n# Security Finding at line ${selectedFinding.line_start}: ${selectedFinding.title}`,
        language,
        file_path: selectedFinding.file_path,
        finding_title: selectedFinding.title,
        finding_description: selectedFinding.description || selectedFinding.title,
        line_start: selectedFinding.line_start,
        line_end: null,
        suggested_fix: selectedFinding.suggested_fix || null,
      });
      setPatch(response.success ? response.patch : `# Patch generation failed for: ${selectedFinding.title}`);
    } catch (err) {
      console.error("Patch generation failed:", err);
      setPatch(`# Error generating patch: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setGeneratingPatch(false);
    }
  };

  const handleCopy = () => {
    if (patch) {
      navigator.clipboard.writeText(patch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Select a row
  const handleSelect = (f: ReviewBrief) => {
    setSelectedFinding(f);
    setPatch(null); // Reset patch when selecting a new finding
  };

  return (
    <motion.div variants={containerV} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={itemV} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield size={24} className="text-[var(--color-accent)]" />
            Security Audit
          </h1>
          <p className="text-sm text-white/40 mt-1">Deep security scanning across all connected repositories</p>
        </div>
      </motion.div>

      {error && (
        <motion.div variants={itemV} className="glass rounded-xl p-4 border border-[var(--color-critical)]/30 flex items-center gap-3">
          <WifiOff size={18} className="text-[var(--color-critical)] shrink-0" />
          <div>
            <p className="text-sm text-white/80">Could not load security baseline</p>
            <p className="text-xs text-white/40 mt-0.5">{error}</p>
          </div>
          <button onClick={fetchData} className="ml-auto text-xs text-[var(--color-accent-light)] hover:text-white transition-colors shrink-0">Retry</button>
        </motion.div>
      )}

      {/* Stats Summary */}
      {stats && (
        <motion.div variants={itemV} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass rounded-xl p-5 border-l-2 border-[var(--color-critical)]">
            <div className="flex items-center justify-between mb-3">
              <ShieldAlert size={20} className="text-[var(--color-critical)]" />
              <span className="text-[10px] uppercase font-bold text-white/40">Critical</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.critical}</p>
          </div>
          <div className="glass rounded-xl p-5 border-l-2 border-[var(--color-high)]">
            <div className="flex items-center justify-between mb-3">
              <AlertTriangle size={20} className="text-[var(--color-high)]" />
              <span className="text-[10px] uppercase font-bold text-white/40">High</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.high}</p>
          </div>
          <div className="glass rounded-xl p-5 border-l-2 border-[var(--color-medium)]">
            <div className="flex items-center justify-between mb-3">
              <Shield size={20} className="text-[var(--color-medium)]" />
              <span className="text-[10px] uppercase font-bold text-white/40">Medium</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.medium}</p>
          </div>
          <div className="glass rounded-xl p-5 border-l-2 border-[var(--color-accent)]">
            <div className="flex items-center justify-between mb-3">
              <ShieldCheck size={20} className="text-[var(--color-accent)]" />
              <span className="text-[10px] uppercase font-bold text-white/40">Security Total</span>
            </div>
            <p className="text-2xl font-black text-white">{stats.category_breakdown.security || 0}</p>
          </div>
        </motion.div>
      )}

      {/* Main layout: List + Details */}
      <div className="flex gap-5">
        <motion.div variants={containerV} className="flex-1 glass rounded-xl overflow-hidden self-start">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-white/[0.02]">
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider w-24">Risk</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Vulnerability</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider w-48">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-3"><div className="w-16 h-4 rounded-full bg-white/5" /></td>
                    <td className="px-5 py-3"><div className="w-48 h-4 rounded bg-white/5" /></td>
                    <td className="px-5 py-3"><div className="w-32 h-3 rounded bg-white/5" /></td>
                  </tr>
                ))
              ) : findings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-16 text-center">
                    <ShieldCheck size={40} className="mx-auto text-[var(--color-accent)] mb-3 opacity-50" />
                    <p className="text-sm font-medium text-white/80">No active security threats</p>
                    <p className="text-xs text-white/40 mt-1">Your codebase is currently secure.</p>
                  </td>
                </tr>
              ) : (
                findings.map((finding) => {
                  const isSelected = selectedFinding?.id === finding.id;
                  return (
                    <motion.tr
                      key={finding.id}
                      onClick={() => handleSelect(finding)}
                      className={clsx(
                        "transition-all cursor-pointer group hover:bg-white/[0.03]",
                        isSelected && "bg-white/[0.05]"
                      )}
                    >
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLASSES[finding.severity] || "severity-info"}`}>
                          {finding.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <p className={clsx("text-sm transition-colors", isSelected ? "text-white font-medium" : "text-white/80 group-hover:text-white")}>
                          {finding.title}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-xs text-white/40 font-mono truncate max-w-40 flex items-center gap-2">
                         {finding.file_path}:{finding.line_start}
                         <ChevronRight size={14} className={clsx("ml-auto transition-transform", isSelected ? "text-white" : "text-transparent group-hover:text-white/30")} />
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)]">
              <p className="text-xs text-white/30">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-3 py-1.5 rounded bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30">
                  <ChevronLeft size={14} /> Prev
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center gap-1 px-3 py-1.5 rounded bg-white/5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-30">
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Selected Details Panel */}
        <AnimatePresence>
          {selectedFinding && (
            <motion.div
              initial={{ opacity: 0, x: 20, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 420 }}
              exit={{ opacity: 0, x: 20, width: 0 }}
              className="shrink-0"
              style={{ width: 420 }}
            >
              <div className="glass rounded-xl h-full flex flex-col overflow-hidden sticky top-8 max-h-[calc(100vh-6rem)]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-black/20">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${SEVERITY_COLORS[selectedFinding.severity]} 20%, transparent)`, color: SEVERITY_COLORS[selectedFinding.severity] }}>
                      {selectedFinding.severity === "critical" || selectedFinding.severity === "high" ? <ShieldAlert size={16} /> : <Shield size={16} />}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white tracking-wide">Threat Intel</h3>
                      <p className="text-[10px] text-white/40 uppercase">{selectedFinding.severity} Risk</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedFinding(null)} className="text-white/30 hover:text-white/60 p-1 rounded hover:bg-white/5 transition-colors"><X size={16} /></button>
                </div>
                
                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1 space-y-6">
                  <div>
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Issue Description</h4>
                    <p className="text-sm text-white/90 leading-relaxed font-medium">{selectedFinding.title}</p>
                    {selectedFinding.description && selectedFinding.description !== selectedFinding.title && (
                       <p className="text-sm text-white/60 leading-relaxed mt-2">{selectedFinding.description}</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2 flex items-center justify-between">
                      Location
                      <span className="bg-white/5 px-2 py-0.5 rounded text-white/60 font-mono text-[10px]">Line {selectedFinding.line_start}</span>
                    </h4>
                    <div className="bg-black/40 rounded-lg p-3 border border-white/5">
                      <p className="text-xs font-mono text-white/70 break-all">{selectedFinding.file_path}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-2">Remediation</h4>
                    {selectedFinding.suggested_fix ? (
                      <div className="bg-[#2ed573]/10 border border-[#2ed573]/20 rounded-lg p-3">
                        <p className="text-xs text-[#2ed573]/90 leading-relaxed">{selectedFinding.suggested_fix}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-white/40 italic">No specific remediation provided by the analyzer.</p>
                    )}
                  </div>

                  {/* Fix-it Autopatch */}
                  <div className="pt-2 border-t border-[var(--color-border)]">
                    <h4 className="text-xs text-[var(--color-accent)] uppercase tracking-wider font-semibold mb-3 flex items-center gap-2">
                      <Wrench size={14} /> AI Auto-Patch
                    </h4>
                    
                    {!patch ? (
                      <button
                        onClick={handleGeneratePatch}
                        disabled={generatingPatch}
                        className={clsx(
                          "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all",
                          generatingPatch
                            ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)] animate-pulse cursor-wait"
                            : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] hover:shadow-[0_0_15px_var(--color-accent-glow)]"
                        )}
                      >
                        {generatingPatch ? <><Loader2 size={16} className="animate-spin" /> Analyzing vulnerability...</> : "Generate Security Patch"}
                      </button>
                    ) : (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-[#2ed573] font-mono tracking-wider">patch.diff generated</span>
                          <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 transition-colors">
                            {copied ? <><Check size={12} className="text-[#2ed573]" /> Copied!</> : <><Copy size={12} /> Copy Patch</>}
                          </button>
                        </div>
                        <div className="rounded-lg bg-black/50 border border-white/10 overflow-hidden">
                          <pre className="text-[10px] font-mono p-3 overflow-x-auto leading-relaxed">
                            {patch.split("\n").map((line, i) => (
                              <div
                                key={i}
                                className={clsx(
                                  "px-1 -mx-1 rounded-sm",
                                  line.startsWith("+") && !line.startsWith("+++") && "bg-[#2ed573]/10 text-[#2ed573]",
                                  line.startsWith("-") && !line.startsWith("---") && "bg-[#ff4757]/10 text-[#ff6b6b]",
                                  line.startsWith("@@") && "text-[var(--color-accent-light)]",
                                  (line.startsWith("---") || line.startsWith("+++")) && "text-white/60 font-semibold",
                                  !line.startsWith("+") && !line.startsWith("-") && !line.startsWith("@") && "text-white/40"
                                )}
                              >
                                {line}
                              </div>
                            ))}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </div>

                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </motion.div>
  );
}
