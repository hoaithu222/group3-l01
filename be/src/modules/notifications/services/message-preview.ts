import { parseMarkers, buildTextForSearch } from "../../mentions/public";

export interface PreviewMention {
  type: string;
  targetId: string | null;
  label: string | null;
}

export interface PreviewMessage {
  content: string | null;
  mentions: PreviewMention[];
  attachments: { kind: string; name: string }[];
}

const segmenter = new Intl.Segmenter("vi", { granularity: "grapheme" });

/** Cắt theo grapheme (emoji ghép ZWJ = 1) — thêm "…" khi bị cắt. */
export function truncateGraphemes(text: string, max: number): string {
  const graphemes = Array.from(segmenter.segment(text), (s) => s.segment);
  return graphemes.length > max ? `${graphemes.slice(0, max).join("").trimEnd()}…` : text;
}

function attachmentPlaceholder(kind: string, name: string): string {
  switch (kind) {
    case "IMAGE":
      return "[Ảnh]";
    case "VIDEO":
      return "[Video]";
    case "VOICE":
      return "[Tin nhắn thoại]";
    case "AUDIO":
      return "[Âm thanh]";
    default:
      return `[Tệp] ${name}`;
  }
}

/**
 * Trích đoạn hiển thị cho push `FULL` (≤ `LIMITS.notification.previewMaxChars`) và `InboxItem.context.excerpt`
 * (≤ 120): marker mention → `@tên` (nhãn lưu sẵn ở `Message.mentions[].label`), xuống dòng gộp thành khoảng
 * trắng, tệp → "[Ảnh]"/"[Tệp] tên". Tương đương `excerptOf` của `messages` + thay marker (tin đã có nhãn nên
 * KHÔNG cần tra tên lại).
 */
export function renderMessagePreview(message: PreviewMessage, maxChars: number): string {
  const content = message.content?.trim() ?? "";
  if (content !== "") {
    const markers = parseMarkers(content);
    const text = buildTextForSearch(content, markers, (m) => {
      if (m.type === "ALL") return "tất cả";
      if (m.type === "ROLE") return m.targetId ?? "vai trò";
      const found = message.mentions.find((x) => x.type === "USER" && x.targetId === m.targetId);
      return found?.label ?? "ai đó";
    });
    return truncateGraphemes(text.replace(/\s+/g, " ").trim(), maxChars);
  }
  const first = message.attachments[0];
  return first ? truncateGraphemes(attachmentPlaceholder(first.kind, first.name), maxChars) : "";
}
