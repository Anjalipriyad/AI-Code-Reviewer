"""
AI Code Reviewer — AI Analyzer Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deep code analysis engine combining:
  1. LangChain LLM chains  — semantic understanding via GPT-4o
  2. Python AST parsing    — deterministic structural analysis

Takes source code as input and returns a structured JSON report:
  • syntax_issues       — parsing errors, malformed constructs
  • security_risks      — SQLi, XSS, path traversal, hardcoded secrets
  • time_complexity     — Big-O analysis per function
  • refactor_suggestions — code smell detection, DRY violations, naming

Architecture:
  ┌────────────┐    ┌────────────────┐    ┌───────────────────┐
  │  Raw Code  │───▶│  AST Analyzer  │───▶│                   │
  │  (string)  │    │ (deterministic)│    │  Merged Report    │
  │            │───▶│  LLM Analyzer  │───▶│  (JSON)           │
  └────────────┘    │  (LangChain)   │    └───────────────────┘
                    └────────────────┘
"""
from __future__ import annotations

import ast
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field as PydanticField

from app.config import settings

logger = logging.getLogger(__name__)


# ╔══════════════════════════════════════════════════════════════╗
# ║                   Output Schema (Pydantic)                   ║
# ╚══════════════════════════════════════════════════════════════╝

class SyntaxIssue(BaseModel):
    """A syntax or structural issue found in the code."""
    line: int
    column: int | None = None
    message: str
    severity: str = PydanticField(
        description="One of: error, warning, info"
    )
    code_snippet: str | None = None


class SecurityRisk(BaseModel):
    """A security vulnerability detected in the code."""
    type: str = PydanticField(
        description="Vulnerability type: sqli, xss, path_traversal, "
        "command_injection, hardcoded_secret, insecure_deserialization, "
        "ssrf, open_redirect"
    )
    line: int
    description: str
    severity: str = PydanticField(
        description="One of: critical, high, medium, low"
    )
    cwe_id: str | None = PydanticField(
        None,
        description="Common Weakness Enumeration ID, e.g. CWE-89"
    )
    remediation: str


class ComplexityAnalysis(BaseModel):
    """Time complexity analysis for a single function."""
    function_name: str
    line: int
    time_complexity: str = PydanticField(
        description="Big-O notation, e.g. O(n), O(n^2), O(n log n)"
    )
    space_complexity: str | None = PydanticField(
        None,
        description="Big-O space, e.g. O(1), O(n)"
    )
    reasoning: str
    has_nested_loops: bool = False
    has_recursion: bool = False


class RefactorSuggestion(BaseModel):
    """A code improvement suggestion."""
    line_start: int
    line_end: int | None = None
    category: str = PydanticField(
        description="One of: dry_violation, naming, design_pattern, "
        "simplification, error_handling, type_safety, documentation"
    )
    title: str
    description: str
    suggested_code: str | None = None
    priority: str = PydanticField(
        description="One of: high, medium, low"
    )


class AnalysisReport(BaseModel):
    """Complete analysis report returned by the AI Analyzer."""
    syntax_issues: list[SyntaxIssue] = []
    security_risks: list[SecurityRisk] = []
    time_complexity: list[ComplexityAnalysis] = []
    refactor_suggestions: list[RefactorSuggestion] = []
    metadata: dict[str, Any] = PydanticField(default_factory=dict)


# ╔══════════════════════════════════════════════════════════════╗
# ║                 AST-Based Analyzer                           ║
# ╚══════════════════════════════════════════════════════════════╝

# Security-sensitive patterns (function names, module usage)
_SQL_PATTERNS = re.compile(
    r"""(?ix)
    (?:execute|executemany|raw|cursor\.execute)\s*\(
    .*?(?:%s|%d|\.format\(|f['\"]|{\w+}|\+\s*\w+)
    """,
)

_XSS_PATTERNS = re.compile(
    r"""(?ix)
    (?:innerHTML|outerHTML|document\.write|\.html\(|
    render_template_string|Markup\(|mark_safe\()
    """,
)

_SECRET_PATTERNS = re.compile(
    r"""(?ix)
    (?:password|secret|api_key|apikey|token|private_key)
    \s*=\s*['\"][^'\"]{8,}['\"]
    """,
)

_DANGEROUS_FUNCTIONS = {
    "eval": "CWE-95: Eval injection — arbitrary code execution",
    "exec": "CWE-95: Exec injection — arbitrary code execution",
    "compile": "CWE-95: Dynamic code compilation risk",
    "__import__": "CWE-502: Dynamic import — potential code injection",
    "pickle.loads": "CWE-502: Insecure deserialization",
    "pickle.load": "CWE-502: Insecure deserialization",
    "yaml.load": "CWE-502: Use yaml.safe_load() instead",
    "subprocess.call": "CWE-78: OS command injection risk (use subprocess.run)",
    "subprocess.Popen": "CWE-78: OS command injection risk",
    "os.system": "CWE-78: OS command injection via os.system()",
    "os.popen": "CWE-78: OS command injection via os.popen()",
}


class _ASTAnalyzer(ast.NodeVisitor):
    """
    Walks the Python AST to extract deterministic insights:
      • Syntax issues (caught during ast.parse)
      • Security risks (dangerous function calls, SQL injection patterns)
      • Complexity hints (nested loops, recursion detection)
      • Structural metrics (function count, class count, nesting depth)
    """

    def __init__(self, source: str) -> None:
        self.source = source
        self.lines = source.splitlines()
        self.syntax_issues: list[dict] = []
        self.security_risks: list[dict] = []
        self.functions: list[dict] = []
        self.complexity_hints: list[dict] = []

        # Internal tracking
        self._current_function: str | None = None
        self._loop_depth = 0
        self._function_has_recursion = False
        self._function_start_line = 0

    def analyze(self) -> dict[str, list]:
        """Parse and walk the AST, returning all findings."""
        try:
            tree = ast.parse(self.source)
        except SyntaxError as e:
            self.syntax_issues.append({
                "line": e.lineno or 1,
                "column": e.offset,
                "message": str(e.msg),
                "severity": "error",
                "code_snippet": (
                    self.lines[e.lineno - 1]
                    if e.lineno and e.lineno <= len(self.lines)
                    else None
                ),
            })
            return self._results()

        self.visit(tree)
        self._scan_regex_patterns()

        return self._results()

    def _results(self) -> dict[str, list]:
        return {
            "syntax_issues": self.syntax_issues,
            "security_risks": self.security_risks,
            "complexity_hints": self.complexity_hints,
            "functions": self.functions,
        }

    # ── Visitors ──────────────────────────────────────────────

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        prev_func = self._current_function
        prev_recursion = self._function_has_recursion
        prev_loop_depth = self._loop_depth

        self._current_function = node.name
        self._function_has_recursion = False
        self._function_start_line = node.lineno
        self._loop_depth = 0

        self.functions.append({
            "name": node.name,
            "line": node.lineno,
            "args": len(node.args.args),
            "decorators": [
                ast.dump(d) for d in node.decorator_list
            ],
        })

        self.generic_visit(node)

        # After visiting body, record complexity hints
        max_loop_depth_in_func = self._loop_depth
        self.complexity_hints.append({
            "function_name": node.name,
            "line": node.lineno,
            "max_loop_nesting": max_loop_depth_in_func,
            "has_recursion": self._function_has_recursion,
        })

        self._current_function = prev_func
        self._function_has_recursion = prev_recursion
        self._loop_depth = prev_loop_depth

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_For(self, node: ast.For) -> None:
        self._loop_depth += 1
        self.generic_visit(node)
        self._loop_depth -= 1

    visit_While = visit_For

    def visit_Call(self, node: ast.Call) -> None:
        func_name = self._get_call_name(node)

        # Check for recursion
        if func_name and func_name == self._current_function:
            self._function_has_recursion = True

        # Check for dangerous functions
        if func_name and func_name in _DANGEROUS_FUNCTIONS:
            self.security_risks.append({
                "type": "dangerous_function",
                "line": node.lineno,
                "description": (
                    f"Dangerous function `{func_name}()` detected. "
                    f"{_DANGEROUS_FUNCTIONS[func_name]}"
                ),
                "severity": "high" if "injection" in func_name or func_name in ("eval", "exec") else "medium",
                "cwe_id": self._extract_cwe(
                    _DANGEROUS_FUNCTIONS[func_name]
                ),
                "remediation": f"Replace `{func_name}()` with a safer alternative.",
            })

        # Check for SQL injection via string formatting in execute()
        if func_name and "execute" in func_name:
            for arg in node.args:
                if isinstance(arg, ast.JoinedStr):  # f-string
                    self.security_risks.append({
                        "type": "sqli",
                        "line": node.lineno,
                        "description": (
                            "SQL injection risk: f-string used in "
                            f"`{func_name}()`. Use parameterized queries."
                        ),
                        "severity": "critical",
                        "cwe_id": "CWE-89",
                        "remediation": (
                            "Use parameterized queries: "
                            "cursor.execute('SELECT * FROM t WHERE id = %s', (id,))"
                        ),
                    })
                elif isinstance(arg, ast.BinOp) and isinstance(
                    arg.op, (ast.Mod, ast.Add)
                ):
                    self.security_risks.append({
                        "type": "sqli",
                        "line": node.lineno,
                        "description": (
                            "SQL injection risk: string concatenation/formatting "
                            f"used in `{func_name}()`. Use parameterized queries."
                        ),
                        "severity": "critical",
                        "cwe_id": "CWE-89",
                        "remediation": (
                            "Use parameterized queries instead of "
                            "string formatting for SQL."
                        ),
                    })

        self.generic_visit(node)

    def _scan_regex_patterns(self) -> None:
        """Scan raw source for patterns that may not appear in AST."""
        for i, line in enumerate(self.lines, 1):
            # Hardcoded secrets
            if _SECRET_PATTERNS.search(line):
                self.security_risks.append({
                    "type": "hardcoded_secret",
                    "line": i,
                    "description": (
                        "Potential hardcoded secret or credential detected."
                    ),
                    "severity": "high",
                    "cwe_id": "CWE-798",
                    "remediation": (
                        "Move secrets to environment variables or a "
                        "secrets manager."
                    ),
                })

            # XSS patterns
            if _XSS_PATTERNS.search(line):
                self.security_risks.append({
                    "type": "xss",
                    "line": i,
                    "description": (
                        "Potential XSS vulnerability: user input may be "
                        "rendered as unescaped HTML."
                    ),
                    "severity": "high",
                    "cwe_id": "CWE-79",
                    "remediation": (
                        "Sanitize and escape user input before rendering. "
                        "Use template auto-escaping."
                    ),
                })

    # ── Helpers ───────────────────────────────────────────────

    @staticmethod
    def _get_call_name(node: ast.Call) -> str | None:
        """Extract the function name from a Call node."""
        if isinstance(node.func, ast.Name):
            return node.func.id
        elif isinstance(node.func, ast.Attribute):
            parts = []
            obj = node.func
            while isinstance(obj, ast.Attribute):
                parts.append(obj.attr)
                obj = obj.value
            if isinstance(obj, ast.Name):
                parts.append(obj.id)
            return ".".join(reversed(parts))
        return None

    @staticmethod
    def _extract_cwe(description: str) -> str | None:
        match = re.search(r"CWE-\d+", description)
        return match.group() if match else None


# ╔══════════════════════════════════════════════════════════════╗
# ║                LangChain LLM Analyzer                        ║
# ╚══════════════════════════════════════════════════════════════╝

_SYSTEM_PROMPT = """\
You are an elite senior software engineer performing an autonomous code review.
Analyze the provided source code and return a JSON report with EXACTLY these keys:

1. **syntax_issues** — Array of objects:
   - line (int): line number
   - column (int|null): column number
   - message (str): description of the issue
   - severity (str): "error" | "warning" | "info"
   - code_snippet (str|null): the problematic line

2. **security_risks** — Array of objects:
   - type (str): "sqli" | "xss" | "path_traversal" | "command_injection" | "hardcoded_secret" | "insecure_deserialization" | "ssrf" | "open_redirect"
   - line (int): line number
   - description (str): detailed description
   - severity (str): "critical" | "high" | "medium" | "low"
   - cwe_id (str|null): CWE identifier (e.g. "CWE-89")
   - remediation (str): how to fix it

3. **time_complexity** — Array of objects:
   - function_name (str): name of the function/method
   - line (int): line number where the function starts
   - time_complexity (str): Big-O notation (e.g. "O(n)", "O(n^2)")
   - space_complexity (str|null): Big-O space notation
   - reasoning (str): explain WHY this complexity
   - has_nested_loops (bool): true if function contains nested loops
   - has_recursion (bool): true if function is recursive

4. **refactor_suggestions** — Array of objects:
   - line_start (int): starting line
   - line_end (int|null): ending line
   - category (str): "dry_violation" | "naming" | "design_pattern" | "simplification" | "error_handling" | "type_safety" | "documentation"
   - title (str): short summary
   - description (str): detailed explanation
   - suggested_code (str|null): improved code snippet
   - priority (str): "high" | "medium" | "low"

Rules:
- Return ONLY valid JSON, no markdown fences, no explanation outside JSON.
- Be precise with line numbers — they must match the provided code.
- Only report REAL issues. Do not hallucinate problems.
- For security: focus on SQL injection, XSS, command injection, path traversal, hardcoded secrets.
- For complexity: analyze every function/method. Consider loops, recursion, built-in sort calls.
- For refactoring: suggest concrete improvements, not vague advice.
- If a category has no findings, return an empty array.
"""

_HUMAN_PROMPT = """\
Analyze the following {language} code:

```{language}
{code}
```

File path: {file_path}

Return the analysis as a JSON object with keys: syntax_issues, security_risks, time_complexity, refactor_suggestions.
"""


class _LLMAnalyzer:
    """
    LangChain-powered semantic code analysis.

    Uses a structured output chain:
        Prompt → ChatOpenAI → JsonOutputParser → AnalysisReport
    """

    def __init__(self) -> None:
        self.llm = ChatOpenAI(
            model=settings.llm_model_name,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            api_key=settings.openai_api_key,
        )
        self.parser = JsonOutputParser(pydantic_object=AnalysisReport)
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", _SYSTEM_PROMPT),
            ("human", _HUMAN_PROMPT),
        ])
        self.chain = self.prompt | self.llm | self.parser

    async def analyze(
        self,
        code: str,
        language: str = "python",
        file_path: str = "unknown",
    ) -> dict[str, Any]:
        """
        Run LLM-based analysis on the provided code.

        Args:
            code: The source code to analyze.
            language: Programming language (for prompt context).
            file_path: File path (for context in the prompt).

        Returns:
            Dict with syntax_issues, security_risks,
            time_complexity, refactor_suggestions.
        """
        try:
            result = await self.chain.ainvoke({
                "code": code,
                "language": language,
                "file_path": file_path,
            })
            return result
        except json.JSONDecodeError as e:
            logger.error("LLM returned invalid JSON: %s", e)
            return _empty_report()
        except Exception as e:
            logger.error("LLM analysis failed: %s", e, exc_info=True)
            return _empty_report()


# ╔══════════════════════════════════════════════════════════════╗
# ║                 Public API — AIAnalyzer                      ║
# ╚══════════════════════════════════════════════════════════════╝

class AIAnalyzer:
    """
    Main entry point for code analysis.

    Combines AST-based deterministic analysis with LLM-based
    semantic analysis, deduplicates findings, and returns a
    unified AnalysisReport.

    Usage:
        analyzer = AIAnalyzer()
        report = await analyzer.analyze(
            code='def foo(): eval(input())',
            language='python',
            file_path='src/main.py',
        )
        print(report.security_risks)  # SQLi, XSS, etc.
    """

    def __init__(self) -> None:
        self._llm_analyzer = _LLMAnalyzer()

    async def analyze(
        self,
        code: str,
        language: str = "python",
        file_path: str = "unknown",
    ) -> AnalysisReport:
        """
        Run the full analysis pipeline.

        Args:
            code: Source code string to analyze.
            language: Programming language of the code.
            file_path: Path of the file being analyzed.

        Returns:
            AnalysisReport with all four analysis categories populated.
        """
        logger.info(
            "Starting analysis for %s (%d chars, lang=%s)",
            file_path,
            len(code),
            language,
        )

        # ── Phase 1: Deterministic AST analysis (Python only) ──
        ast_results = _empty_ast_results()
        if language.lower() == "python":
            try:
                ast_analyzer = _ASTAnalyzer(code)
                ast_results = ast_analyzer.analyze()
                logger.info(
                    "AST analysis complete: %d syntax, %d security, "
                    "%d complexity hints",
                    len(ast_results["syntax_issues"]),
                    len(ast_results["security_risks"]),
                    len(ast_results["complexity_hints"]),
                )
            except Exception as e:
                logger.error("AST analysis failed: %s", e, exc_info=True)

        # ── Phase 2: LLM semantic analysis ─────────────────────
        llm_results = await self._llm_analyzer.analyze(
            code=code,
            language=language,
            file_path=file_path,
        )
        logger.info(
            "LLM analysis complete: %d syntax, %d security, "
            "%d complexity, %d refactor",
            len(llm_results.get("syntax_issues", [])),
            len(llm_results.get("security_risks", [])),
            len(llm_results.get("time_complexity", [])),
            len(llm_results.get("refactor_suggestions", [])),
        )

        # ── Phase 3: Merge & deduplicate ───────────────────────
        report = self._merge_results(ast_results, llm_results, code)

        logger.info(
            "Final report: %d syntax | %d security | "
            "%d complexity | %d refactor",
            len(report.syntax_issues),
            len(report.security_risks),
            len(report.time_complexity),
            len(report.refactor_suggestions),
        )

        return report

    async def analyze_quick(
        self,
        code: str,
        language: str = "python",
    ) -> AnalysisReport:
        """
        Quick AST-only analysis (no LLM call).
        Useful for real-time linting or when API keys are unavailable.
        """
        ast_results = _empty_ast_results()
        if language.lower() == "python":
            ast_analyzer = _ASTAnalyzer(code)
            ast_results = ast_analyzer.analyze()

        return AnalysisReport(
            syntax_issues=[
                SyntaxIssue(**i) for i in ast_results["syntax_issues"]
            ],
            security_risks=[
                SecurityRisk(**r) for r in ast_results["security_risks"]
            ],
            time_complexity=[
                ComplexityAnalysis(
                    function_name=h["function_name"],
                    line=h["line"],
                    time_complexity=self._estimate_complexity_from_ast(h),
                    reasoning="Estimated from loop nesting and recursion.",
                    has_nested_loops=h["max_loop_nesting"] > 1,
                    has_recursion=h["has_recursion"],
                )
                for h in ast_results.get("complexity_hints", [])
            ],
            refactor_suggestions=[],
            metadata={"analyzer": "ast_only"},
        )

    # ── Merging Logic ────────────────────────────────────────

    def _merge_results(
        self,
        ast_results: dict,
        llm_results: dict,
        code: str,
    ) -> AnalysisReport:
        """
        Merge AST and LLM findings with deduplication.

        Strategy:
          • AST findings have higher confidence (deterministic)
          • LLM findings fill gaps (refactoring, complexity reasoning)
          • Deduplicate by (line, type/category) fingerprint
        """
        # ── Syntax issues: AST is ground truth, LLM supplements ──
        seen_syntax = {
            (i["line"], i["message"][:50])
            for i in ast_results.get("syntax_issues", [])
        }
        merged_syntax = [
            SyntaxIssue(**i)
            for i in ast_results.get("syntax_issues", [])
        ]
        for issue in llm_results.get("syntax_issues", []):
            key = (issue.get("line", 0), issue.get("message", "")[:50])
            if key not in seen_syntax:
                merged_syntax.append(SyntaxIssue(**issue))
                seen_syntax.add(key)

        # ── Security risks: AST + LLM, dedupe by (line, type) ──
        seen_security = {
            (r["line"], r["type"])
            for r in ast_results.get("security_risks", [])
        }
        merged_security = [
            SecurityRisk(**r)
            for r in ast_results.get("security_risks", [])
        ]
        for risk in llm_results.get("security_risks", []):
            key = (risk.get("line", 0), risk.get("type", ""))
            if key not in seen_security:
                merged_security.append(SecurityRisk(**risk))
                seen_security.add(key)

        # ── Time complexity: LLM is primary, AST enriches ──
        ast_hints = {
            h["function_name"]: h
            for h in ast_results.get("complexity_hints", [])
        }
        merged_complexity = []
        for entry in llm_results.get("time_complexity", []):
            fn_name = entry.get("function_name", "")
            hint = ast_hints.pop(fn_name, None)
            if hint:
                # Enrich LLM result with deterministic AST data
                entry["has_nested_loops"] = (
                    entry.get("has_nested_loops", False)
                    or hint.get("max_loop_nesting", 0) > 1
                )
                entry["has_recursion"] = (
                    entry.get("has_recursion", False)
                    or hint.get("has_recursion", False)
                )
            merged_complexity.append(ComplexityAnalysis(**entry))

        # Any functions AST found but LLM missed
        for fn_name, hint in ast_hints.items():
            merged_complexity.append(
                ComplexityAnalysis(
                    function_name=fn_name,
                    line=hint["line"],
                    time_complexity=self._estimate_complexity_from_ast(hint),
                    reasoning="Estimated from loop nesting depth.",
                    has_nested_loops=hint.get("max_loop_nesting", 0) > 1,
                    has_recursion=hint.get("has_recursion", False),
                )
            )

        # ── Refactor suggestions: LLM only (AST doesn't do this) ──
        merged_refactor = [
            RefactorSuggestion(**s)
            for s in llm_results.get("refactor_suggestions", [])
        ]

        return AnalysisReport(
            syntax_issues=merged_syntax,
            security_risks=merged_security,
            time_complexity=merged_complexity,
            refactor_suggestions=merged_refactor,
            metadata={
                "analyzers_used": ["ast", "langchain"],
                "code_length": len(code),
                "total_lines": code.count("\n") + 1,
            },
        )

    @staticmethod
    def _estimate_complexity_from_ast(hint: dict) -> str:
        """Rough Big-O estimate from AST-detected loop nesting."""
        depth = hint.get("max_loop_nesting", 0)
        has_recursion = hint.get("has_recursion", False)

        if has_recursion and depth > 0:
            return "O(2^n)"  # Conservative for recursive + loops
        if has_recursion:
            return "O(n)"    # Simple recursion without loops
        if depth == 0:
            return "O(1)"
        if depth == 1:
            return "O(n)"
        if depth == 2:
            return "O(n^2)"
        return f"O(n^{depth})"


# ╔══════════════════════════════════════════════════════════════╗
# ║              Fix-it Patch Generator (LLM)                    ║
# ╚══════════════════════════════════════════════════════════════╝

_FIX_SYSTEM_PROMPT = """\
You are an elite software engineer generating a minimal, precise unified diff
(git patch) to fix a specific code issue.

Rules:
- Output ONLY a valid unified diff. No markdown fences, no explanation.
- Use the standard unified diff format:
  --- a/{file_path}
  +++ b/{file_path}
  @@ -start,count +start,count @@
   context line
  -removed line
  +added line
   context line
- Include 3 lines of context above and below the change.
- Make the SMALLEST change that fixes the issue. Do NOT refactor unrelated code.
- Preserve the original indentation, style, and conventions.
- The patch must be directly applicable via `git apply`.
"""

_FIX_HUMAN_PROMPT = """\
Fix the following issue in the code:

**Issue:** {finding_title}
**Description:** {finding_description}
**File:** {file_path}
**Line(s):** {line_start}{line_end_str}
{suggested_fix_section}

**Full source code:**
```{language}
{code}
```

Generate a unified diff patch to fix this issue.
"""


class _PatchGenerator:
    """LangChain-powered git patch generator."""

    def __init__(self) -> None:
        self.llm = ChatOpenAI(
            model=settings.llm_model_name,
            temperature=0.0,  # Deterministic for patches
            max_tokens=settings.llm_max_tokens,
            api_key=settings.openai_api_key,
        )
        self.prompt = ChatPromptTemplate.from_messages([
            ("system", _FIX_SYSTEM_PROMPT),
            ("human", _FIX_HUMAN_PROMPT),
        ])
        self.chain = self.prompt | self.llm

    async def generate(
        self,
        code: str,
        language: str,
        file_path: str,
        finding_title: str,
        finding_description: str,
        line_start: int,
        line_end: int | None = None,
        suggested_fix: str | None = None,
    ) -> str:
        """
        Generate a unified diff patch for the given finding.

        Returns:
            A string containing the unified diff patch.
        """
        line_end_str = f"–{line_end}" if line_end else ""
        suggested_fix_section = (
            f"**Suggested approach:** {suggested_fix}"
            if suggested_fix
            else ""
        )

        try:
            result = await self.chain.ainvoke({
                "code": code,
                "language": language,
                "file_path": file_path,
                "finding_title": finding_title,
                "finding_description": finding_description,
                "line_start": line_start,
                "line_end_str": line_end_str,
                "suggested_fix_section": suggested_fix_section,
            })
            # Extract content from AIMessage
            patch = result.content.strip()
            # Remove markdown fences if the LLM wrapped them
            if patch.startswith("```"):
                lines = patch.split("\n")
                patch = "\n".join(lines[1:-1]) if lines[-1].startswith("```") else "\n".join(lines[1:])
            return patch
        except Exception as e:
            logger.error("Patch generation failed: %s", e, exc_info=True)
            return f"# Error generating patch: {str(e)}"


# Expose on the public AIAnalyzer class
# (added via monkey-patching to keep diff minimal)

async def _generate_fix_patch(
    self: "AIAnalyzer",
    code: str,
    language: str = "python",
    file_path: str = "unknown",
    finding_title: str = "",
    finding_description: str = "",
    line_start: int = 1,
    line_end: int | None = None,
    suggested_fix: str | None = None,
) -> str:
    """
    Generate a unified diff patch to fix a specific finding.

    Args:
        code: Full source code of the file.
        language: Programming language.
        file_path: Path of the file.
        finding_title: Short title of the issue.
        finding_description: Detailed description of the issue.
        line_start: Starting line of the issue.
        line_end: Ending line of the issue (optional).
        suggested_fix: Hint for the LLM on how to fix (optional).

    Returns:
        Unified diff string.
    """
    if not hasattr(self, "_patch_generator"):
        self._patch_generator = _PatchGenerator()

    logger.info(
        "Generating fix patch for '%s' at %s:%d",
        finding_title,
        file_path,
        line_start,
    )

    return await self._patch_generator.generate(
        code=code,
        language=language,
        file_path=file_path,
        finding_title=finding_title,
        finding_description=finding_description,
        line_start=line_start,
        line_end=line_end,
        suggested_fix=suggested_fix,
    )

# Attach the method to AIAnalyzer
AIAnalyzer.generate_fix_patch = _generate_fix_patch


# ╔══════════════════════════════════════════════════════════════╗
# ║                    Helper Functions                          ║
# ╚══════════════════════════════════════════════════════════════╝

def _empty_report() -> dict[str, list]:
    """Return an empty analysis result dict (for error fallback)."""
    return {
        "syntax_issues": [],
        "security_risks": [],
        "time_complexity": [],
        "refactor_suggestions": [],
    }


def _empty_ast_results() -> dict[str, list]:
    """Return empty AST analysis results."""
    return {
        "syntax_issues": [],
        "security_risks": [],
        "complexity_hints": [],
        "functions": [],
    }
