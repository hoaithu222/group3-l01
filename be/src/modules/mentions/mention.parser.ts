/**
 * be.md §5.1 — parser marker mention trong nội dung tin đã chuẩn hoá:
 *   `@{u:<userId 24-hex>}` · `@{all}` · `@{r:ADMIN|MEMBER}` (P1, chỉ parse,
 *   `MentionService` từ chối ở bước validate — P0 chưa hỗ trợ).
 * Marker KHÔNG khớp regex (vd `@{u:xyz}` id sai độ dài) tự động bị bỏ qua —
 * giữ nguyên như văn bản thường, KHÔNG lỗi (be.md §5.1 "được giữ như văn bản
 * thường").
 */

export type ParsedMentionType = "USER" | "ROLE" | "ALL";

export interface ParsedMarker {
  type: ParsedMentionType;
  /** ObjectId hex cho USER, "ADMIN"/"MEMBER" cho ROLE, `null` cho ALL. */
  targetId: string | null;
  /** Vị trí bắt đầu/kết thúc (exclusive) trong `content` gốc — dùng để thay bằng `@label` khi build `textForSearch`. */
  start: number;
  end: number;
}

const USER_MARKER_RE = /@\{u:([0-9a-fA-F]{24})\}/g;
const ALL_MARKER_RE = /@\{all\}/g;
const ROLE_MARKER_RE = /@\{r:(ADMIN|MEMBER)\}/g;

/** Trả các marker hợp lệ tìm thấy trong `content`, sắp theo vị trí xuất hiện (`start` tăng dần). */
export function parseMarkers(content: string): ParsedMarker[] {
  const markers: ParsedMarker[] = [];

  for (const match of content.matchAll(USER_MARKER_RE)) {
    markers.push({ type: "USER", targetId: match[1], start: match.index, end: match.index + match[0].length });
  }
  for (const match of content.matchAll(ALL_MARKER_RE)) {
    markers.push({ type: "ALL", targetId: null, start: match.index, end: match.index + match[0].length });
  }
  for (const match of content.matchAll(ROLE_MARKER_RE)) {
    markers.push({ type: "ROLE", targetId: match[1], start: match.index, end: match.index + match[0].length });
  }

  markers.sort((a, b) => a.start - b.start);
  return markers;
}

/**
 * be.md §5.1 `textForSearch` — thay từng marker bằng `@label` (đi từ CUỐI
 * chuỗi lên đầu để vị trí `start`/`end` của các marker còn lại không lệch).
 * `labelFor` trả nhãn hiển thị cho 1 marker (tên user hiện tại, "tất cả",
 * nhãn vai trò...) — service gọi SAU khi đã resolve label thật từ DB.
 */
export function buildTextForSearch(
  content: string,
  markers: ParsedMarker[],
  labelFor: (marker: ParsedMarker) => string
): string {
  let result = content;
  const byStartDesc = [...markers].sort((a, b) => b.start - a.start);
  for (const marker of byStartDesc) {
    const label = labelFor(marker);
    result = `${result.slice(0, marker.start)}@${label}${result.slice(marker.end)}`;
  }
  return result;
}

/** Khoá so khớp `(type, targetId)` — dùng để đối chiếu marker ↔ `mentions[]` (be.md §5.2 bước 1). */
export function mentionKey(type: ParsedMentionType, targetId: string | null): string {
  return `${type}:${targetId ?? ""}`;
}
