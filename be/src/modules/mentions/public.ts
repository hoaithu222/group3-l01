/**
 * Barrel CÔNG KHAI của module `mentions` (p1-06) — ngoại lệ có chủ đích của luật "modules KHÔNG import
 * chéo module" (`.claude/rules/architecture.md`), cùng cơ chế `@modules/messages/public`.
 *
 * `parseMarkers`/`buildTextForSearch` — hàm THUẦN (không I/O). p1-07 (`notifications`) dùng để thay marker
 * `@{u:<id>}`/`@{all}`/`@{r:ROLE}` bằng `@tên` khi dựng trích đoạn push (`lockScreenPreview=FULL`) và
 * `InboxItem.context.excerpt` — KHÔNG chép lại regex marker ở module khác.
 */
export { parseMarkers, buildTextForSearch, type ParsedMarker, type ParsedMentionType } from "./mention.parser";
