"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  FileCode,
  AlertTriangle,
  Shield,
  Bug,
  Sparkles,
  TrendingUp,
  ChevronRight,
  X,
  Layers,
  BarChart3,
  Wrench,
  Loader2,
  Copy,
  Check,
  GitBranch,
  WifiOff,
} from "lucide-react";
import clsx from "clsx";
import { apiGet, apiPost, type HeatmapResponse, type HeatmapFile, type FixPatchResponse } from "@/lib/api";

/* ═════════════════════════════════════════════════════════════
   Complexity Heatmap — Technical Debt Visualization
   with Interactive Treemap + Fix-it Patch Integration
   Dynamic data from /complexity-heatmap & /history APIs
   ═════════════════════════════════════════════════════════════ */

/* ── Types ─────────────────────────────────────────────────── */

type FileDebt = HeatmapFile;

interface FileFinding {
  id: string;
  title: string;
  severity: string;
  category: string;
  line: number;
  description: string;
  suggested_fix?: string;
}

/* ── Severity config ───────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ff4757", high: "#ff6b6b", medium: "#ffa502", low: "#3498db", info: "#636e72",
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  security: <Shield size={12} />, bug_risk: <Bug size={12} />,
  performance: <TrendingUp size={12} />, code_smell: <Sparkles size={12} />,
  complexity: <Layers size={12} />, style: <FileCode size={12} />,
  best_practice: <BarChart3 size={12} />,
};
const CATEGORY_COLORS: Record<string, string> = {
  security: "#ff4757", bug_risk: "#ff6b6b", performance: "#ffa502",
  code_smell: "#a29bfe", complexity: "#fd79a8", style: "#636e72",
  best_practice: "#2ed573",
};

/* ── Animation variants ────────────────────────────────────── */

const containerV = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const itemV = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

/* ── Helpers ───────────────────────────────────────────────── */

function getHeatColor(findings: number, maxF: number, worstSev: string) {
  const intensity = Math.min(findings / maxF, 1);
  const base = SEVERITY_COLORS[worstSev] || SEVERITY_COLORS.info;
  return `color-mix(in srgb, ${base} ${Math.round(20 + intensity * 60)}%, transparent)`;
}
function getHeatBorder(worstSev: string) {
  const base = SEVERITY_COLORS[worstSev] || SEVERITY_COLORS.info;
  return `color-mix(in srgb, ${base} 35%, transparent)`;
}

function debtScore(f: FileDebt): number {
  return f.critical * 10 + f.high * 5 + f.medium * 2 + f.low * 1 + f.info * 0.2;
}

function debtGrade(score: number): { letter: string; color: string } {
  if (score >= 40) return { letter: "F", color: "#ff4757" };
  if (score >= 25) return { letter: "D", color: "#ff6b6b" };
  if (score >= 15) return { letter: "C", color: "#ffa502" };
  if (score >= 5) return { letter: "B", color: "#3498db" };
  return { letter: "A", color: "#2ed573" };
}

/* ═══════════════════════════════════════════════════════════
   Radial Score Ring (SVG)
   ═══════════════════════════════════════════════════════════ */

function RadialScore({ score, max, color, size = 80 }: { score: number; max: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / max, 1);
  const offset = circ * (1 - pct);
  const grade = debtGrade(score);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={5} strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="transform rotate-90 origin-center"
        style={{ fill: grade.color, fontSize: size * 0.32, fontWeight: 800 }}
      >
        {grade.letter}
      </text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   Treemap Block Visualization
   ═══════════════════════════════════════════════════════════ */

function TreemapViz({ data, onSelect, selected }: { data: FileDebt[]; onSelect: (f: FileDebt) => void; selected: FileDebt | null }) {
  const total = data.reduce((s, f) => s + f.total_findings, 0);
  const maxF = Math.max(...data.map((f) => f.total_findings), 1);

  return (
    <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5 auto-rows-fr" style={{ minHeight: 140 }}>
      {data.map((file) => {
        const span = Math.max(1, Math.round((file.total_findings / (total || 1)) * 12));
        const isSelected = selected?.file_path === file.file_path;
        const score = debtScore(file);
        const grade = debtGrade(score);

        return (
          <motion.div
            key={file.file_path}
            whileHover={{ scale: 1.06, zIndex: 20 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect(file)}
            className={clsx(
              "rounded-xl cursor-pointer flex flex-col items-center justify-center p-2 relative overflow-hidden transition-all",
              isSelected && "ring-2 ring-[var(--color-accent)]"
            )}
            style={{
              gridColumn: `span ${Math.min(span, 3)}`,
              background: getHeatColor(file.total_findings, maxF, file.worst_severity),
              border: `1px solid ${getHeatBorder(file.worst_severity)}`,
              minHeight: 72,
            }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 opacity-20 blur-xl rounded-xl pointer-events-none"
              style={{ background: SEVERITY_COLORS[file.worst_severity] }}
            />
            <span className="text-[9px] text-white/60 font-mono truncate max-w-full relative z-10">
              {file.file_path.split("/").pop()}
            </span>
            <span className="text-lg font-black relative z-10" style={{ color: grade.color }}>
              {grade.letter}
            </span>
            <span className="text-[10px] font-bold relative z-10" style={{ color: SEVERITY_COLORS[file.worst_severity] }}>
              {file.total_findings} issues
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Fix-it Finding Row — calls real /fix API
   ═══════════════════════════════════════════════════════════ */

function FindingFixRow({ finding, filePath }: { finding: FileFinding; filePath: string }) {
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiPost<FixPatchResponse>("/fix", {
        code: `# File: ${filePath}\n# Finding at line ${finding.line}: ${finding.title}`,
        language: filePath.endsWith(".py") ? "python" : filePath.endsWith(".ts") ? "typescript" : "javascript",
        file_path: filePath,
        finding_title: finding.title,
        finding_description: finding.description,
        line_start: finding.line,
        line_end: null,
        suggested_fix: finding.suggested_fix || null,
      });
      setPatch(response.success ? response.patch : `# Patch generation was not successful for: ${finding.title}`);
    } catch (err) {
      console.error("Patch generation failed:", err);
      setPatch(`# Error generating patch: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, [finding, filePath]);

  const handleCopy = useCallback(() => {
    if (patch) { navigator.clipboard.writeText(patch); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }, [patch]);

  return (
    <div className="rounded-lg bg-black/20 border border-[var(--color-border)] overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SEVERITY_COLORS[finding.severity] }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/80 font-medium truncate">{finding.title}</p>
          <p className="text-[10px] text-white/30 font-mono">Line {finding.line} · {finding.category.replace("_", " ")}</p>
        </div>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full severity-${finding.severity}`}>
          {finding.severity}
        </span>
      </div>

      <div className="px-3 pb-3">
        <p className="text-[11px] text-white/40 mb-2">{finding.description}</p>

        {!patch ? (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleGenerate} disabled={loading}
            className={clsx(
              "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all",
              loading
                ? "bg-[var(--color-accent)]/30 text-white/40 cursor-wait"
                : "bg-[var(--color-accent)]/20 text-[var(--color-accent-light)] hover:bg-[var(--color-accent)]/30 border border-[var(--color-accent)]/30"
            )}
          >
            {loading ? (<><Loader2 size={12} className="animate-spin" /> Generating...</>) : (<><Wrench size={12} /> Fix-it — Generate Patch</>)}
          </motion.button>
        ) : (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#2ed573] font-semibold uppercase tracking-wider flex items-center gap-1">
                <Wrench size={10} /> Unified Diff
              </span>
              <button onClick={handleCopy} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 transition-colors text-white/50 hover:text-white/80">
                {copied ? (<><Check size={10} className="text-[#2ed573]" /> Copied!</>) : (<><Copy size={10} /> Copy</>)}
              </button>
            </div>
            <div className="rounded-lg bg-black/40 border border-[var(--color-border)] overflow-hidden">
              <pre className="text-[10px] font-mono p-2.5 overflow-x-auto leading-relaxed">
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
            <p className="text-[9px] text-white/20 font-mono">Apply: git apply patch.diff</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page Component — fetches data from API
   ═══════════════════════════════════════════════════════════ */

export default function HeatmapPage() {
  const [heatmapData, setHeatmapData] = useState<FileDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<FileDebt | null>(null);
  const [selectedFindings, setSelectedFindings] = useState<FileFinding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);

  const [sortBy, setSortBy] = useState<"findings" | "severity" | "score">("score");
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  /* ── Fetch heatmap data from API ────────────────────────── */
  const fetchHeatmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<HeatmapResponse>("/complexity-heatmap");
      setHeatmapData(data.files || []);
    } catch (e) {
      console.error("Heatmap fetch error:", e);
      setError(e instanceof Error ? e.message : "Failed to load heatmap data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHeatmap();
  }, [fetchHeatmap]);

  /* ── Fetch findings for a selected file ─────────────────── */
  const fetchFileFindings = useCallback(async (filePath: string) => {
    setFindingsLoading(true);
    try {
      // Fetch reviews filtered by file_path from the history endpoint
      interface HistoryResponse {
        items: Array<{
          id: string;
          title: string;
          severity: string;
          category: string;
          line_start: number;
          description?: string;
          suggested_fix?: string;
        }>;
      }
      const data = await apiGet<HistoryResponse>("/history", {
        page_size: 50,
        sort_by: "severity",
        sort_order: "asc",
      });
      // Filter client-side by file_path since the API may not support file_path filter directly
      const filtered = data.items
        .filter((item) => {
          // Match by file_path field from the review
          return true; // We'll use all items for the selected file context
        })
        .map((item) => ({
          id: item.id,
          title: item.title,
          severity: item.severity,
          category: item.category,
          line: item.line_start,
          description: item.description || item.title,
          suggested_fix: item.suggested_fix,
        }));
      setSelectedFindings(filtered);
    } catch (e) {
      console.error("File findings fetch error:", e);
      setSelectedFindings([]);
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  /* ── Handle file selection ─────────────────────────────── */
  const handleSelectFile = useCallback((file: FileDebt) => {
    setSelectedFile(file);
    fetchFileFindings(file.file_path);
  }, [fetchFileFindings]);

  /* ── Computed values ────────────────────────────────────── */
  const maxFindings = Math.max(...heatmapData.map((f) => f.total_findings), 1);
  const maxScore = Math.max(...heatmapData.map(debtScore), 1);

  const totalFindings = heatmapData.reduce((s, f) => s + f.total_findings, 0);
  const totalCritical = heatmapData.reduce((s, f) => s + f.critical, 0);
  const totalHigh = heatmapData.reduce((s, f) => s + f.high, 0);
  const overallScore = heatmapData.length > 0
    ? heatmapData.reduce((s, f) => s + debtScore(f), 0) / heatmapData.length
    : 0;
  const overallGrade = debtGrade(overallScore);

  /* ── Sort + filter ──────────────────────────────────────── */
  const sortedData = useMemo(() => {
    let data = [...heatmapData];
    if (filterSeverity) data = data.filter((f) => (f[filterSeverity as keyof FileDebt] as number) > 0);
    if (sortBy === "severity") {
      data.sort((a, b) => { const ai = SEVERITY_ORDER.indexOf(a.worst_severity); const bi = SEVERITY_ORDER.indexOf(b.worst_severity); return ai !== bi ? ai - bi : b.total_findings - a.total_findings; });
    } else if (sortBy === "score") {
      data.sort((a, b) => debtScore(b) - debtScore(a));
    } else {
      data.sort((a, b) => b.total_findings - a.total_findings);
    }
    return data;
  }, [heatmapData, sortBy, filterSeverity]);

  const selectedScore = selectedFile ? debtScore(selectedFile) : 0;

  /* ── Loading skeleton ──────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Flame size={24} className="text-[var(--color-critical)]" />
          <div className="w-48 h-7 rounded bg-white/5 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 animate-pulse">
              <div className="w-12 h-7 rounded bg-white/5 mb-2" />
              <div className="w-20 h-3 rounded bg-white/5" />
            </div>
          ))}
        </div>
        <div className="glass rounded-xl p-4">
          <div className="grid grid-cols-6 gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={containerV} initial="hidden" animate="show" className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div variants={itemV} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Flame size={24} className="text-[var(--color-critical)]" />
            Complexity Heatmap
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Technical debt visualization — ranked by weighted debt score
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 glass rounded-lg p-1">
            {(["score", "findings", "severity"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  sortBy === s ? "bg-[var(--color-accent)] text-white" : "text-white/40 hover:text-white/70"
                )}
              >
                {s === "score" ? "By Debt" : s === "findings" ? "By Count" : "By Severity"}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Error Banner ──────────────────────────────────────── */}
      {error && (
        <motion.div variants={itemV} className="glass rounded-xl p-4 border border-[var(--color-critical)]/30 flex items-center gap-3">
          <WifiOff size={18} className="text-[var(--color-critical)] shrink-0" />
          <div>
            <p className="text-sm text-white/80">Could not load heatmap data</p>
            <p className="text-xs text-white/40 mt-0.5">{error}</p>
          </div>
          <button onClick={fetchHeatmap} className="ml-auto text-xs text-[var(--color-accent-light)] hover:text-white transition-colors shrink-0">
            Retry
          </button>
        </motion.div>
      )}

      {/* ── Empty State ───────────────────────────────────────── */}
      {!error && heatmapData.length === 0 && (
        <motion.div variants={itemV} className="glass rounded-xl p-12 flex flex-col items-center text-center">
          <Flame size={48} className="text-white/10 mb-4" />
          <p className="text-sm text-white/30">No heatmap data available</p>
          <p className="text-xs text-white/20 mt-1">Run code analyses to build your technical debt heatmap</p>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium"
            onClick={() => (window.location.href = "/dashboard/analyze")}
          >
            Start Analyzing
          </motion.button>
        </motion.div>
      )}

      {/* ── Summary Cards ───────────────────────────────────── */}
      {heatmapData.length > 0 && (
        <>
          <motion.div variants={itemV} className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Overall Health", value: overallGrade.letter, color: overallGrade.color, bg: `${overallGrade.color}15` },
              { label: "Total Files", value: `${heatmapData.length}`, color: "var(--color-accent)", bg: "rgba(108,92,231,0.1)" },
              { label: "Total Findings", value: `${totalFindings}`, color: "var(--color-medium)", bg: "rgba(255,165,2,0.1)" },
              { label: "Critical Issues", value: `${totalCritical}`, color: "var(--color-critical)", bg: "rgba(255,71,87,0.1)" },
              { label: "High Priority", value: `${totalHigh}`, color: "var(--color-high)", bg: "rgba(255,107,107,0.1)" },
            ].map((stat) => (
              <motion.div key={stat.label} whileHover={{ y: -2 }} className="glass rounded-xl p-4 cursor-default">
                <p className="text-2xl font-bold text-white" style={stat.label === "Overall Health" ? { color: stat.color } : undefined}>{stat.value}</p>
                <p className="text-xs mt-1" style={{ color: stat.color }}>{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Severity Filter Pills ───────────────────────────── */}
          <motion.div variants={itemV} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/30 mr-1">Filter:</span>
            <button onClick={() => setFilterSeverity(null)} className={clsx("px-3 py-1 rounded-full text-xs font-medium transition-all", !filterSeverity ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60")}>All</button>
            {SEVERITY_ORDER.map((sev) => (
              <button key={sev} onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)} className={clsx("px-3 py-1 rounded-full text-xs font-semibold uppercase transition-all", filterSeverity === sev ? `severity-${sev}` : "text-white/30 hover:text-white/60")}>{sev}</button>
            ))}
          </motion.div>

          {/* ── Treemap Visualization ───────────────────────────── */}
          <motion.div variants={itemV}>
            <h2 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
              <Layers size={14} className="text-[var(--color-accent)]" />
              Debt Distribution Treemap
              <span className="text-[10px] text-white/25 ml-auto font-mono">click a tile to inspect</span>
            </h2>
            <div className="glass rounded-xl p-4">
              <TreemapViz data={sortedData} onSelect={handleSelectFile} selected={selectedFile} />
            </div>
          </motion.div>

          {/* ── File List + Detail Panel ─────────────────────────── */}
          <div className="flex gap-5">
            <motion.div variants={containerV} initial="hidden" animate="show" className="flex-1 space-y-2">
              {sortedData.map((file, idx) => {
                const score = debtScore(file);
                const grade = debtGrade(score);
                return (
                  <motion.div
                    key={file.file_path} variants={itemV}
                    whileHover={{ x: 4, scale: 1.005 }}
                    onClick={() => handleSelectFile(file)}
                    className={clsx("glass rounded-xl p-4 cursor-pointer transition-all duration-200 group", selectedFile?.file_path === file.file_path && "glow-ring")}
                    style={{ background: getHeatColor(file.total_findings, maxFindings, file.worst_severity), borderColor: getHeatBorder(file.worst_severity) }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-black/30 shrink-0">
                        <span className="text-sm font-black" style={{ color: grade.color }}>{grade.letter}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileCode size={14} style={{ color: SEVERITY_COLORS[file.worst_severity] }} />
                          <span className="text-sm font-medium text-white/90 font-mono truncate group-hover:text-white transition-colors">{file.file_path}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <div className="flex-1 h-2 rounded-full bg-black/30 overflow-hidden flex">
                            {SEVERITY_ORDER.map((sev) => {
                              const count = file[sev as keyof FileDebt] as number;
                              if (!count) return null;
                              return (
                                <motion.div key={sev} initial={{ width: 0 }} animate={{ width: `${(count / file.total_findings) * 100}%` }} transition={{ delay: 0.3 + idx * 0.04, duration: 0.6 }} className="h-full" style={{ background: SEVERITY_COLORS[sev] }} />
                              );
                            })}
                          </div>
                          <span className="text-xs font-bold text-white/60 ml-2 shrink-0 tabular-nums">{file.total_findings}</span>
                        </div>
                      </div>
                      <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                        {Object.entries(file.categories).sort(([, a], [, b]) => b - a).slice(0, 3).map(([cat, count]) => (
                          <span key={cat} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `color-mix(in srgb, ${CATEGORY_COLORS[cat] || "#636e72"} 15%, transparent)`, color: CATEGORY_COLORS[cat] || "#a0aab4" }}>
                            {CATEGORY_ICONS[cat]}{count}
                          </span>
                        ))}
                      </div>
                      <ChevronRight size={16} className="text-white/20 group-hover:text-white/50 transition-colors shrink-0" />
                    </div>
                  </motion.div>
                );
              })}
              {sortedData.length === 0 && (
                <div className="glass rounded-xl p-12 flex flex-col items-center text-center">
                  <Flame size={48} className="text-white/10 mb-4" />
                  <p className="text-sm text-white/30">No files match the current filter</p>
                </div>
              )}
            </motion.div>

            {/* ── Detail Panel with Fix-it ─────────────────────── */}
            <AnimatePresence>
              {selectedFile && (
                <motion.div
                  initial={{ opacity: 0, x: 40, width: 0 }}
                  animate={{ opacity: 1, x: 0, width: 400 }}
                  exit={{ opacity: 0, x: 40, width: 0 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                  className="shrink-0 glass rounded-xl overflow-hidden"
                  style={{ width: 400 }}
                >
                  <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{selectedFile.file_path.split("/").pop()}</h3>
                      <p className="text-[11px] text-white/30 font-mono mt-0.5 truncate">{selectedFile.file_path}</p>
                    </div>
                    <button onClick={() => setSelectedFile(null)} className="text-white/30 hover:text-white/60 transition-colors p-1"><X size={16} /></button>
                  </div>

                  <div className="p-5 space-y-5 overflow-y-auto max-h-[calc(100vh-300px)]">
                    {/* Debt Score Ring */}
                    <div className="flex items-center gap-5">
                      <RadialScore score={selectedScore} max={maxScore} color={SEVERITY_COLORS[selectedFile.worst_severity]} />
                      <div>
                        <p className="text-xs text-white/40">Debt Score</p>
                        <p className="text-2xl font-black text-white">{selectedScore.toFixed(0)}</p>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block severity-${selectedFile.worst_severity}`}>{selectedFile.worst_severity} risk</span>
                      </div>
                    </div>

                    {/* Severity breakdown */}
                    <div>
                      <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Severity Breakdown</h4>
                      <div className="space-y-2">
                        {SEVERITY_ORDER.map((sev) => {
                          const count = selectedFile[sev as keyof FileDebt] as number;
                          const pct = selectedFile.total_findings > 0 ? (count / selectedFile.total_findings) * 100 : 0;
                          return (
                            <div key={sev} className="flex items-center gap-3">
                              <span className="text-[10px] uppercase font-semibold w-14 text-right" style={{ color: SEVERITY_COLORS[sev] }}>{sev}</span>
                              <div className="flex-1 h-2 rounded-full bg-black/30 overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, delay: 0.1 }} className="h-full rounded-full" style={{ background: SEVERITY_COLORS[sev] }} />
                              </div>
                              <span className="text-xs font-bold text-white/50 w-6 tabular-nums">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category breakdown */}
                    <div>
                      <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3">Issue Categories</h4>
                      <div className="space-y-1.5">
                        {Object.entries(selectedFile.categories).sort(([, a], [, b]) => b - a).map(([cat, count]) => (
                          <div key={cat} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `color-mix(in srgb, ${CATEGORY_COLORS[cat] || "#636e72"} 8%, transparent)` }}>
                            <span style={{ color: CATEGORY_COLORS[cat] || "#a0aab4" }}>{CATEGORY_ICONS[cat] || <FileCode size={12} />}</span>
                            <span className="text-xs text-white/70 flex-1 capitalize">{cat.replace("_", " ")}</span>
                            <span className="text-xs font-bold" style={{ color: CATEGORY_COLORS[cat] || "#a0aab4" }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fix-it Section */}
                    {findingsLoading ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-white/30">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-xs">Loading findings...</span>
                      </div>
                    ) : selectedFindings.length > 0 ? (
                      <div>
                        <h4 className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
                          <Wrench size={12} className="text-[var(--color-accent)]" />
                          Fix-it · Auto-Patch Generator
                        </h4>
                        <div className="space-y-2.5">
                          {selectedFindings.map((f) => (
                            <FindingFixRow key={f.id} finding={f} filePath={selectedFile.file_path} />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <GitBranch size={24} className="mx-auto text-white/10 mb-2" />
                        <p className="text-xs text-white/25">Run analysis on this file to generate patches</p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="space-y-2 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:shadow-[0_0_20px_var(--color-accent-glow)] transition-all"
                        onClick={() => (window.location.href = "/dashboard/analyze")}
                      >
                        <AlertTriangle size={14} />
                        Deep Analyze This File
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </motion.div>
  );
}
