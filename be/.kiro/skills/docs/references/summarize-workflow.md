# Summarize Workflow

> Kiro IDE: `$1`, `$2` = đối số thứ nhất, thứ hai người dùng gõ sau `/docs summarize` (IDE không tự thay placeholder).

Activate `ck:scout` skill to analyze the codebase and update `docs/codebase-summary.md` and respond with a summary report.

## Arguments
$1: Focused topics (default: all)
$2: Should scan codebase (`Boolean`, default: `false`)

## Focused Topics
<focused_topics>$1</focused_topics>

## Should Scan Codebase
<should_scan_codebase>$2</should_scan_codebase>

## Important
- Use `docs/` directory as the source of truth for documentation.
- Do not scan the entire codebase unless the user explicitly requests it.
- **Do not** start implementing.
