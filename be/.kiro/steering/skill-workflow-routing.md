---
inclusion: always
---

# Skill Workflow Routing

> Kiro IDE: skill đã cài trong `.kiro/skills/` ghi không có tiền tố `ck:` (`/code-review`, `/ck-debug`, `/fix`, `/brainstorm`). Các `/ck:*` còn lại chưa cài — thay bằng: `ck:plan` → agent `planner` (hoặc Kiro Spec); `ck:cook` → tự triển khai theo `primary-workflow.md`; `ck:test` → agent `tester`; `ck:scout` → subagent `context-gatherer`; `ck:journal` → agent `journal-writer`; `ck:ship`, `ck:worktree` → không có (bỏ qua hoặc hỏi người dùng). Chi tiết: mục 5 của `.kiro/steering/kiro-compat.md`.

When orchestrating multi-step tasks, consider these workflow sequences. Skills are listed in typical execution order.

## Core Development Workflow

```
/ck:plan → /ck:cook → /ck:test → /code-review → /ck:ship → /ck:journal
```

| User Intent | Suggested Start |
|-------------|----------------|
| "implement feature X", "build X", "add X" | `/ck:plan` then `/ck:cook` |
| "execute this plan" | `/ck:cook <plan-path>` |
| "quick implementation" | `/ck:cook --fast` |

## Bugfix Workflow

```
/ck:scout → /ck-debug → /fix → /ck:test → /code-review
```

| User Intent | Suggested Start |
|-------------|----------------|
| "X is broken", "error in X", "bug in X" | `/fix` (auto-scouts internally) |
| "CI is failing", "tests broken" | `/fix --auto` |
| "investigate why X happens" | `/ck:scout` then `/ck-debug` |

## Investigation Workflow

```
/ck:scout → /ck-debug → /brainstorm → /ck:plan
```

| User Intent | Suggested Start |
|-------------|----------------|
| "understand how X works" | `/ck:scout` |
| "why is X happening" | `/ck-debug` |
| "explore options for X" | `/brainstorm` then `/ck:plan` |

## Post-Implementation Checklist

After completing implementation work, consider:
- `/code-review` — review changes before merging
- `/ck:ship` — run full shipping pipeline (tests, review, version, PR)
- `/ck:journal` — document decisions and lessons learned

## Setup Skills

Before starting implementation in a shared codebase:
- `/ck:worktree` — create isolated worktree for the feature/fix
- `/ck:scout` — discover relevant files and code patterns
