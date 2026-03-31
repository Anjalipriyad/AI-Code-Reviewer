/**
 * AI Code Reviewer — Frontend API Client
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Typed fetch wrappers for the FastAPI backend.
 * Reads NEXT_PUBLIC_API_URL from environment.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005/api/v1";

/* ── Generic helpers ──────────────────────────────────────── */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(body, res.status);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(url.toString());
  return handleResponse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

/* ── Typed response interfaces ────────────────────────────── */

export interface ReviewStats {
  total_reviews: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  dismissed: number;
  avg_confidence: number;
  category_breakdown: Record<string, number>;
}

export interface ReviewBrief {
  id: string;
  file_path: string;
  line_start: number;
  severity: string;
  category: string;
  title: string;
  confidence_score: number;
  is_dismissed: boolean;
  created_at?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RepositoryBrief {
  id: string;
  name: string;
  full_name: string;
  provider: string;
  language: string | null;
  is_active: boolean;
}

export interface AnalysisFinding {
  type: string;
  severity: string;
  line: number;
  line_end?: number;
  description: string;
  remediation?: string;
  cwe_id?: string;
  time_complexity?: string;
  function_name?: string;
  reasoning?: string;
  title?: string;
  suggested_code?: string;
  category?: string;
  line_start?: number;
  line_end_refactor?: number;
  priority?: string;
  message?: string;
  code_snippet?: string;
  confidence?: number;
}

export interface AnalysisReport {
  syntax_issues: AnalysisFinding[];
  security_risks: AnalysisFinding[];
  time_complexity: AnalysisFinding[];
  refactor_suggestions: AnalysisFinding[];
}

export interface AnalyzeResponse {
  analysis: AnalysisReport;
  reviews_saved: number;
  repository_id: string | null;
  pull_request_id: string | null;
  message: string;
}

export interface FixPatchResponse {
  patch: string;
  file_path: string;
  success: boolean;
}

export interface HeatmapFile {
  file_path: string;
  total_findings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  worst_severity: string;
  categories: Record<string, number>;
}

export interface HeatmapResponse {
  files: HeatmapFile[];
  total_files: number;
  total_findings: number;
}
