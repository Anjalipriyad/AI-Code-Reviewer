"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiPost, type AnalyzeResponse, type FixPatchResponse } from "@/lib/api";
import {
  Play,
  Zap,
  Loader2,
  AlertTriangle,
  Shield,
  Clock,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  X,
  FileCode,
  Copy,
  Check,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import dynamic from "next/dynamic";

/* ═════════════════════════════════════════════════════════════
   Analyze Page — Monaco Code Editor + Floating AI Findings
   ═══════════════════════════════════════════════════════════ */

// Lazy-load Monaco to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-white/30">
      <Loader2 size={24} className="animate-spin mr-2" />
      Loading editor...
    </div>
  ),
});

/* ── Types ─────────────────────────────────────────────────── */

interface Finding {
  id: string;
  type: "syntax" | "security" | "complexity" | "refactor";
  severity: "critical" | "high" | "medium" | "low" | "info";
  line: number;
  lineEnd?: number;
  title: string;
  description: string;
  remediation?: string;
  cwe?: string;
  complexity?: string;
  suggestedCode?: string;
  confidence: number;
}

interface AnalysisResult {
  syntax_issues: Finding[];
  security_risks: Finding[];
  time_complexity: Finding[];
  refactor_suggestions: Finding[];
}

/* ── Severity config ───────────────────────────────────────── */

const SEVERITY_CONFIG = {
  critical: {
    class: "severity-critical",
    icon: <Shield size={14} />,
    label: "CRITICAL",
    dot: "var(--color-critical)",
  },
  high: {
    class: "severity-high",
    icon: <AlertTriangle size={14} />,
    label: "HIGH",
    dot: "var(--color-high)",
  },
  medium: {
    class: "severity-medium",
    icon: <Clock size={14} />,
    label: "MEDIUM",
    dot: "var(--color-medium)",
  },
  low: {
    class: "severity-low",
    icon: <Lightbulb size={14} />,
    label: "LOW",
    dot: "var(--color-low)",
  },
  info: {
    class: "severity-info",
    icon: <FileCode size={14} />,
    label: "INFO",
    dot: "var(--color-info)",
  },
};

const TYPE_ICONS = {
  syntax: <AlertTriangle size={14} />,
  security: <Shield size={14} />,
  complexity: <Clock size={14} />,
  refactor: <Lightbulb size={14} />,
};

/* ── Sample code for demonstration ─────────────────────────── */

const SAMPLE_CODE = `import sqlite3
import os
from flask import Flask, request, render_template_string

app = Flask(__name__)
DB_PASSWORD = "super_secret_password_123"

def get_user(username):
    """Fetch user from database - VULNERABLE to SQL injection."""
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    query = f"SELECT * FROM users WHERE username = '{username}'"
    cursor.execute(query)
    result = cursor.fetchone()
    conn.close()
    return result

def search_users(users_list, target):
    """Search with O(n^2) complexity."""
    results = []
    for user in users_list:
        for other in users_list:
            if user["name"] == target and other["role"] == "admin":
                results.append(user)
    return results

@app.route("/profile")
def profile():
    name = request.args.get("name", "")
    html = render_template_string(f"<h1>Welcome {name}</h1>")
    return html

@app.route("/run")
def run_command():
    cmd = request.args.get("cmd")
    result = os.system(cmd)
    return str(result)

def fibonacci(n):
    """Recursive fibonacci - O(2^n) time complexity."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

if __name__ == "__main__":
    app.run(debug=True)
`;

/* ── Map API response to UI Finding type ───────────────────── */

function mapApiToFindings(report: AnalyzeResponse["analysis"]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const risk of (report.security_risks || [])) {
    findings.push({
      id: `sec-${++counter}`,
      type: "security",
      severity: mapSeverity(risk.severity),
      line: risk.line || 1,
      lineEnd: risk.line_end,
      title: risk.description?.slice(0, 80) || "Security Risk",
      description: risk.description || "",
      remediation: risk.remediation,
      cwe: risk.cwe_id,
      confidence: risk.confidence ?? 0.85,
    });
  }

  for (const issue of (report.syntax_issues || [])) {
    findings.push({
      id: `syn-${++counter}`,
      type: "syntax",
      severity: mapSeverity(issue.severity),
      line: issue.line || 1,
      title: issue.message || issue.description?.slice(0, 80) || "Syntax Issue",
      description: issue.description || issue.message || "",
      confidence: issue.confidence ?? 1.0,
    });
  }

  for (const comp of (report.time_complexity || [])) {
    findings.push({
      id: `comp-${++counter}`,
      type: "complexity",
      severity: "medium",
      line: comp.line || 1,
      title: `${comp.time_complexity || ""} in ${comp.function_name || "function"}`,
      description: comp.reasoning || comp.description || "",
      complexity: comp.time_complexity,
      remediation: comp.remediation,
      confidence: comp.confidence ?? 0.7,
    });
  }

  for (const ref of (report.refactor_suggestions || [])) {
    findings.push({
      id: `ref-${++counter}`,
      type: "refactor",
      severity: mapSeverity(ref.priority || "low"),
      line: ref.line_start || ref.line || 1,
      lineEnd: ref.line_end_refactor,
      title: ref.title || ref.description?.slice(0, 80) || "Refactor Suggestion",
      description: ref.description || "",
      suggestedCode: ref.suggested_code,
      remediation: ref.remediation,
      confidence: ref.confidence ?? 0.6,
    });
  }

  // Sort by severity priority
  const sevOrder = ["critical", "high", "medium", "low", "info"];
  findings.sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity));
  return findings;
}

function mapSeverity(sev: string | undefined): Finding["severity"] {
  const map: Record<string, Finding["severity"]> = {
    critical: "critical", high: "high", medium: "medium",
    low: "low", info: "info", error: "high", warning: "medium",
  };
  return map[sev || "info"] || "info";
}

/* ═════════════════════════════════════════════════════════════
   Main Component
   ═════════════════════════════════════════════════════════════ */

export default function AnalyzePage() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState("python");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [patches, setPatches] = useState<Record<string, string>>({});
  const [generatingPatch, setGeneratingPatch] = useState<string | null>(null);
  const editorRef = useRef<unknown>(null);

  /* ── Analysis trigger — calls real backend ──────────────── */
  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setFindings([]);
    setHasAnalyzed(false);
    setPatches({});

    try {
      const response = await apiPost<AnalyzeResponse>("/analyze", {
        code,
        language,
        file_path: `untitled.${language === "python" ? "py" : language === "typescript" ? "ts" : "js"}`,
        mode: "full",
      });

      const mapped = mapApiToFindings(response.analysis);
      setFindings(mapped);
      setHasAnalyzed(true);
    } catch (err) {
      console.error("Analysis failed:", err);
      // Show an empty result state on error so the user sees feedback
      setHasAnalyzed(true);
    } finally {
      setIsAnalyzing(false);
    }
  }, [code, language]);

  /* ── Copy helper ───────────────────────────────────────── */
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  /* ── Fix-it patch generator — calls real backend ────────── */
  const handleGeneratePatch = useCallback(
    async (finding: Finding) => {
      setGeneratingPatch(finding.id);

      try {
        const response = await apiPost<FixPatchResponse>("/fix", {
          code,
          language,
          file_path: `untitled.${language === "python" ? "py" : language === "typescript" ? "ts" : "js"}`,
          finding_title: finding.title,
          finding_description: finding.description,
          line_start: finding.line,
          line_end: finding.lineEnd || null,
          suggested_fix: finding.remediation || finding.suggestedCode || null,
        });

        setPatches((prev) => ({
          ...prev,
          [finding.id]: response.success
            ? response.patch
            : "# Patch generation was not successful. Try providing more context.",
        }));
      } catch (err) {
        console.error("Patch generation failed:", err);
        setPatches((prev) => ({
          ...prev,
          [finding.id]: `# Error generating patch: ${err instanceof Error ? err.message : "Unknown error"}`,
        }));
      } finally {
        setGeneratingPatch(null);
      }
    },
    [code, language]
  );

  /* ── Monaco setup ──────────────────────────────────────── */
  function handleEditorMount(editor: unknown) {
    editorRef.current = editor;
  }

  /* ── Severity summary ──────────────────────────────────── */
  const severityCounts = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  /* ── Group findings by line for decorations ────────────── */
  const findingsByLine = findings.reduce(
    (acc, f) => {
      if (!acc[f.line]) acc[f.line] = [];
      acc[f.line].push(f);
      return acc;
    },
    {} as Record<number, Finding[]>
  );

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Analyze Code
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Paste code below and trigger the AI review pipeline
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-white/80 outline-none focus:border-[var(--color-accent)]/50 transition-colors cursor-pointer"
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="java">Java</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
          </select>

          {/* Analyze button */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleAnalyze}
            disabled={isAnalyzing || !code.trim()}
            className={clsx(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
              isAnalyzing
                ? "bg-[var(--color-accent)]/50 text-white/60 cursor-wait"
                : "bg-[var(--color-accent)] text-white hover:shadow-[0_0_20px_var(--color-accent-glow)]"
            )}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Analysis
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* ── Severity Summary Bar ────────────────────────────── */}
      <AnimatePresence>
        {hasAnalyzed && (
          <motion.div
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            className="glass rounded-xl px-5 py-3 flex items-center gap-6"
          >
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Zap size={14} className="text-[var(--color-accent)]" />
              <span className="font-medium text-white">
                {findings.length} findings
              </span>
            </div>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            {Object.entries(severityCounts).map(([sev, count]) => (
              <div key={sev} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background:
                      SEVERITY_CONFIG[sev as keyof typeof SEVERITY_CONFIG]?.dot,
                  }}
                />
                <span className="text-xs text-white/50">
                  {count}{" "}
                  {SEVERITY_CONFIG[sev as keyof typeof SEVERITY_CONFIG]?.label}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Editor + Findings Panel ─────────────────────────── */}
      <div className="flex gap-5 h-[calc(100vh-240px)] min-h-[500px]">
        {/* Code Editor */}
        <div className="flex-1 glass rounded-xl overflow-hidden flex flex-col">
          {/* Editor tab bar */}
          <div className="flex items-center gap-2 px-4 h-10 border-b border-[var(--color-border)] shrink-0">
            <FileCode size={14} className="text-[var(--color-accent)]" />
            <span className="text-xs text-white/50 font-mono">
              untitled.{language === "python" ? "py" : language === "typescript" ? "ts" : "js"}
            </span>
            <span className="text-[10px] text-white/25 ml-auto font-mono">
              {code.split("\n").length} lines
            </span>
          </div>

          {/* Monaco */}
          <div className="flex-1 relative">
            <MonacoEditor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || "")}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "var(--font-geist-mono), 'Fira Code', monospace",
                fontLigatures: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: "on",
                renderLineHighlight: "line",
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                bracketPairColorization: { enabled: true },
                guides: {
                  indentation: true,
                  bracketPairs: true,
                },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />

            {/* Line markers (colored dots next to lines with findings) */}
            {hasAnalyzed && (
              <div className="absolute top-4 left-[10px] pointer-events-none z-10">
                {Object.entries(findingsByLine).map(([lineStr, lineFnds]) => {
                  const lineNo = parseInt(lineStr);
                  const topSeverity = lineFnds.reduce((acc, f) => {
                    const order = ["critical", "high", "medium", "low", "info"];
                    return order.indexOf(f.severity) < order.indexOf(acc)
                      ? f.severity
                      : acc;
                  }, "info" as string);
                  return (
                    <motion.div
                      key={lineNo}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.5 + lineNo * 0.02 }}
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        top: `${(lineNo - 1) * 19}px`,
                        background:
                          SEVERITY_CONFIG[
                            topSeverity as keyof typeof SEVERITY_CONFIG
                          ]?.dot,
                        boxShadow: `0 0 8px ${
                          SEVERITY_CONFIG[
                            topSeverity as keyof typeof SEVERITY_CONFIG
                          ]?.dot
                        }`,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Findings Panel ───────────────────────── */}
        <AnimatePresence>
          {hasAnalyzed && (
            <motion.div
              initial={{ opacity: 0, x: 40, width: 0 }}
              animate={{ opacity: 1, x: 0, width: 380 }}
              exit={{ opacity: 0, x: 40, width: 0 }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="shrink-0 overflow-y-auto space-y-3 pr-1"
              style={{ width: 380 }}
            >
              {/* Findings header */}
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-sm font-semibold text-white/70">
                  AI Findings
                </h2>
                <span className="text-[10px] text-white/30 font-mono">
                  {findings.length} issues
                </span>
              </div>

              {/* Finding cards */}
              {findings.map((finding, idx) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  index={idx}
                  isExpanded={expandedCard === finding.id}
                  isHovered={hoveredLine === finding.line}
                  onToggle={() =>
                    setExpandedCard(
                      expandedCard === finding.id ? null : finding.id
                    )
                  }
                  onHover={(line) => setHoveredLine(line)}
                  onCopy={copyToClipboard}
                  copied={copied}
                  patch={patches[finding.id]}
                  isGeneratingPatch={generatingPatch === finding.id}
                  onGeneratePatch={() => handleGeneratePatch(finding)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   FindingCard — Interactive floating card
   ═════════════════════════════════════════════════════════════ */

function FindingCard({
  finding,
  index,
  isExpanded,
  isHovered,
  onToggle,
  onHover,
  onCopy,
  copied,
  patch,
  isGeneratingPatch,
  onGeneratePatch,
}: {
  finding: Finding;
  index: number;
  isExpanded: boolean;
  isHovered: boolean;
  onToggle: () => void;
  onHover: (line: number | null) => void;
  onCopy: (text: string, id: string) => void;
  copied: string | null;
  patch?: string;
  isGeneratingPatch: boolean;
  onGeneratePatch: () => void;
}) {
  const config = SEVERITY_CONFIG[finding.severity];

  return (
    <motion.div
      initial={{ opacity: 0, x: 30, y: 10 }}
      animate={{
        opacity: 1,
        x: 0,
        y: 0,
        scale: isHovered ? 1.02 : 1,
      }}
      transition={{
        delay: 0.6 + index * 0.08,
        duration: 0.35,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      onMouseEnter={() => onHover(finding.line)}
      onMouseLeave={() => onHover(null)}
      className={clsx(
        "glass float-card rounded-xl cursor-pointer transition-all duration-200",
        isExpanded && "glow-ring",
        isHovered && "border-[var(--color-accent)]/30"
      )}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 p-4 pb-2" onClick={onToggle}>
        {/* Type icon */}
        <div
          className="mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: `color-mix(in srgb, ${config.dot} 15%, transparent)`,
            color: config.dot,
          }}
        >
          {TYPE_ICONS[finding.type]}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${config.class}`}
            >
              {config.label}
            </span>
            {finding.cwe && (
              <span className="text-[10px] text-white/30 font-mono">
                {finding.cwe}
              </span>
            )}
            {finding.complexity && (
              <span className="text-[10px] text-[var(--color-medium)] font-mono font-bold">
                {finding.complexity}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-white/90 leading-snug">
            {finding.title}
          </h3>
          <p className="text-[11px] text-white/30 font-mono mt-1">
            Line {finding.line}
            {finding.lineEnd && finding.lineEnd !== finding.line
              ? `–${finding.lineEnd}`
              : ""}
            {" · "}
            {Math.round(finding.confidence * 100)}% confidence
          </p>
        </div>

        {/* Expand toggle */}
        <button className="mt-1 text-white/30 hover:text-white/60 transition-colors shrink-0">
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expandable details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Description */}
              <p className="text-xs text-white/50 leading-relaxed">
                {finding.description}
              </p>

              {/* Remediation */}
              {finding.remediation && (
                <div className="relative">
                  <div className="text-[10px] text-[#2ed573] font-semibold uppercase tracking-wider mb-1">
                    ✦ Fix
                  </div>
                  <div className="relative group">
                    <pre className="text-xs text-white/70 bg-black/30 rounded-lg p-3 font-mono overflow-x-auto">
                      {finding.remediation}
                    </pre>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopy(finding.remediation!, finding.id);
                      }}
                      className="absolute top-2 right-2 p-1 rounded bg-white/5 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {copied === finding.id ? (
                        <Check size={12} className="text-[#2ed573]" />
                      ) : (
                        <Copy size={12} className="text-white/40" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Suggested code */}
              {finding.suggestedCode && (
                <div>
                  <div className="text-[10px] text-[var(--color-accent-light)] font-semibold uppercase tracking-wider mb-1">
                    ✦ Suggested Code
                  </div>
                  <pre className="text-xs text-white/70 bg-black/30 rounded-lg p-3 font-mono overflow-x-auto">
                    {finding.suggestedCode}
                  </pre>
                </div>
              )}

              {/* Fix-it Patch Button + Diff */}
              <div className="pt-1">
                {!patch ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onGeneratePatch();
                    }}
                    disabled={isGeneratingPatch}
                    className={clsx(
                      "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                      isGeneratingPatch
                        ? "bg-[var(--color-accent)]/30 text-white/40 cursor-wait"
                        : "bg-[var(--color-accent)]/20 text-[var(--color-accent-light)] hover:bg-[var(--color-accent)]/30 border border-[var(--color-accent)]/30"
                    )}
                  >
                    {isGeneratingPatch ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        Generating patch...
                      </>
                    ) : (
                      <>
                        <Wrench size={13} />
                        Fix-it — Generate Git Patch
                      </>
                    )}
                  </motion.button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#2ed573] font-semibold uppercase tracking-wider flex items-center gap-1">
                        <Wrench size={10} />
                        Unified Diff Patch
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(patch, `patch-${finding.id}`);
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-white/5 hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
                      >
                        {copied === `patch-${finding.id}` ? (
                          <>
                            <Check size={10} className="text-[#2ed573]" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={10} />
                            Copy Patch
                          </>
                        )}
                      </button>
                    </div>
                    <div className="rounded-lg bg-black/40 border border-[var(--color-border)] overflow-hidden">
                      <pre className="text-[11px] font-mono p-3 overflow-x-auto leading-relaxed">
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
                    <p className="text-[10px] text-white/25 font-mono">
                      Apply with: git apply patch.diff
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
