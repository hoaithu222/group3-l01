import { LIMITS } from "../../../../core/constants/limits";
import type { IntegrationMessagePayload } from "../../entities/integration.interface";
import { asArray, asRecord, cleanText, safeHttpsUrl } from "./mapper-utils";

const FIGMA_HOSTS = ["figma.com"] as const;
const { titleMax, commitMessageMax } = LIMITS.integration;

/** Khoá file Figma hợp lệ (chỉ dùng để dựng URL API/liên kết — KHÔNG bao giờ nhận URL thô từ người dùng). */
export const FIGMA_FILE_KEY = /^[A-Za-z0-9]{10,64}$/;

/** `https://www.figma.com/(file|design|board|proto)/<key>/…` hoặc khoá thô → khoá file; ngược lại `null`. */
export function parseFigmaFileKey(input: string): string | null {
  const trimmed = input.trim();
  if (FIGMA_FILE_KEY.test(trimmed)) return trimmed;
  const m = /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]{10,64})(?:[/?#]|$)/.exec(trimmed);
  return m?.[1] ?? null;
}

/** Payload webhook Figma v2 (đã lọc — `passcode` đã bị loại) → nội dung tin. `null` = loại sự kiện không hỗ trợ. */
export function mapFigmaEvent(type: string, payload: Record<string, unknown>): IntegrationMessagePayload | null {
  const key = typeof payload.file_key === "string" && FIGMA_FILE_KEY.test(payload.file_key) ? payload.file_key : null;
  const file = cleanText(payload.file_name, titleMax);
  if (!key || !file) return null;
  const by = asRecord(payload.triggered_by);
  const who = cleanText(by?.handle, 60) || "Ai đó";
  const url = safeHttpsUrl(`https://www.figma.com/file/${key}`, FIGMA_HOSTS);
  const base = { source: "figma", provider: "FIGMA" as const, repo: file, actor: { login: who }, ...(url ? { url } : {}) };
  if (type === "FILE_UPDATE") {
    const title = `${who} đã cập nhật file "${file}"`;
    return { ...base, event: type, action: "updated", title, summary: cleanText(title, 300) };
  }
  if (type === "FILE_COMMENT") {
    const text = cleanText(
      asArray(payload.comment)
        .map((part) => (typeof part === "string" ? part : cleanText(asRecord(part)?.text, commitMessageMax)))
        .join(" "),
      commitMessageMax
    );
    const title = `${who} đã bình luận trong "${file}"${text ? `: ${text}` : ""}`;
    return { ...base, event: type, action: "commented", title, summary: cleanText(title, 300) };
  }
  return null;
}
