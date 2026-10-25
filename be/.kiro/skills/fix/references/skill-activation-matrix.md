# Skill Activation Matrix

> Kiro IDE: AskUserQuestion → hỏi trực tiếp người dùng trong chat rồi dừng chờ trả lời; TaskCreate/TaskUpdate/TaskGet/TaskList → todo_list (không hỗ trợ blockedBy/metadata: tạo task theo thứ tự phụ thuộc); `Explore` → invoke_sub_agent với subagent built-in context-gatherer; `Bash` → chạy trực tiếp bằng execute_bash; agent `fullstack-developer` không có trong project này (dùng agent `backend`). Chi tiết: .kiro/steering/kiro-compat.md.

When to activate each skill and tool during fixing workflows.

## Always Activate (ALL Workflows)

| Skill/Tool | Step | Reason |
|------------|------|--------|
| `ck:scout` OR parallel `Explore` | Step 1 | Understand codebase context before diagnosing |
| `ck-debug` | Step 2 | Systematic root cause investigation |
| `sequential-thinking` | Step 2 | Structured hypothesis formation — NO guessing |

## Task Orchestration (Moderate+ Only)

| Tool | Activate When |
|------|---------------|
| `TaskCreate` | After complexity assessment, create all phase tasks upfront |
| `TaskUpdate` | At start/completion of each phase |
| `TaskList` | Check available unblocked work, coordinate parallel agents |
| `TaskGet` | Retrieve full task details before starting work |

Skip Tasks for Quick workflow (< 3 steps). See `references/task-orchestration.md`.

## Auto-Triggered Activation

| Skill | Auto-Trigger Condition |
|-------|------------------------|
| `problem-solving` | 2+ hypotheses REFUTED in Step 2 diagnosis |
| `sequential-thinking` | Always in Step 2 (mandatory for hypothesis formation) |

## Conditional Activation

| Skill | Activate When |
|-------|---------------|
| `brainstorm` | Multiple valid fix approaches, architecture decision (Deep only) |
| `ck:context-engineering` | Fixing AI/LLM/agent code, context window issues |
| `ck:ai-multimodal` | UI issues, screenshots provided, visual bugs |
| `ck:project-management` | Moderate+ workflows — task hydration, sync-back, progress tracking |

## Subagent Usage

| Subagent | Activate When |
|----------|---------------|
| `debugger` | Root cause unclear, need deep investigation (Step 2) |
| `Explore` (parallel) | Scout multiple areas simultaneously (Step 1), test hypotheses (Step 2) |
| `Bash` (parallel) | Verify implementation: typecheck, lint, build, test (Step 5) |
| `researcher` | External docs needed, latest best practices (Deep only) |
| `planner` | Complex fix needs breakdown, multiple phases (Deep only) |
| `tester` | After implementation, verify fix works (Step 5) |
| `code-review` | After fix, verify quality and security (Step 5) |
| `git-manager` | After approval, commit changes (Step 6) |
| `docs-manager` | API/behavior changes need doc updates (Step 6) |
| `project-manager` | Major fix impacts roadmap/plan status (Step 6) |
| `fullstack-developer` | Parallel independent issues (each gets own agent) |

## Parallel Patterns

See `references/parallel-exploration.md` for detailed patterns.

| When | Parallel Strategy |
|------|-------------------|
| Scouting (Step 1) | 2-3 `Explore` agents on different areas |
| Testing hypotheses (Step 2) | 2-3 `Explore` agents per hypothesis |
| Multi-module fix | `Explore` each module in parallel |
| After implementation (Step 5) | `Bash` agents: typecheck + lint + build + test |
| 2+ independent issues | Task trees + `fullstack-developer` agents per issue |

## Workflow → Skills Map

| Workflow | Skills Activated |
|----------|------------------|
| Quick | `ck:scout` (minimal), `ck-debug`, `sequential-thinking`, `code-review`, parallel `Bash` verification |
| Standard | Above + Tasks, `problem-solving` (auto), `ck:project-management`, `tester`, parallel `Explore` |
| Deep | All above + `brainstorm`, `ck:context-engineering`, `researcher`, `planner` |
| Parallel | Per-issue Task trees + `ck:project-management` + `fullstack-developer` agents + coordination via `TaskList` |

## Step → Skills Chain (Mandatory Order)

| Step | Mandatory Chain |
|------|----------------|
| Step 0: Mode | `AskUserQuestion` (unless auto/quick detected) |
| Step 1: Scout | `ck:scout` OR 2-3 parallel `Explore` → map files, deps, tests |
| Step 2: Diagnose | Capture pre-fix state → `ck-debug` → `sequential-thinking` → parallel `Explore` hypotheses → (`problem-solving` if 2+ fail) |
| Step 3: Assess | Classify complexity → create Tasks (moderate+) |
| Step 4: Fix | Implement per workflow → follow root cause |
| Step 5: Verify+Prevent | Iron-law verify → regression test → defense-in-depth → parallel `Bash` verify |
| Step 6: Finalize | Report → `docs-manager` → `TaskUpdate` → `git-manager` → `/ck:journal` |

## Detection Triggers

| Keyword/Pattern | Skill to Consider |
|-----------------|-------------------|
| "AI", "LLM", "agent", "context" | `ck:context-engineering` |
| "stuck", "tried everything" | `problem-solving` |
| "complex", "multi-step" | `sequential-thinking` |
| "which approach", "options" | `brainstorm` |
| "latest docs", "best practice" | `researcher` subagent |
| Screenshot attached | `ck:ai-multimodal` |
