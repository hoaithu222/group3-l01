/**
 * Làm sạch lý do lỗi egress/import trước khi LƯU và hiển thị cho người điều khiển (README p2-06 §6, admin.md §2.3): không URL (có thể là URL ký), không khoá
 * object S3, gọn một dòng ≤ 300 ký tự. Lý do lỗi gốc từ LiveKit có thể chứa đường dẫn bucket/endpoint nội bộ.
 */
export function sanitizeRecordingError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const clean = text
    .replace(/https?:\/\/\S+/gi, "[liên kết]")
    .replace(/\b[\w.-]*\/[\w./-]*\.(?:mp4|ogg|webm|m3u8)\b/gi, "[tệp]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return clean || "Lỗi không xác định";
}
