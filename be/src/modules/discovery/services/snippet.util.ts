import { LIMITS } from "../../../core/constants/limits";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AttachmentRef, MentionRef, SearchHighlight } from "../entities/discovery.interface";

/**
 * Snippet + highlight cho kết quả tìm (be.md p1-09 §5.4 `buildSnippet`).
 *
 * `normalizedContent` (cột được truy vấn) là chuỗi ĐÃ chuẩn hoá (không dấu, chữ
 * thường, gộp khoảng trắng) nên vị trí khớp trong đó KHÔNG dùng được trực tiếp
 * trên `content` gốc. Ở đây chuẩn hoá TỪNG grapheme của `content` (đã thay marker
 * mention thành `@tên` — khớp cách `normalizedContent` được sinh lúc gửi tin), dựng
 * bảng `normIndex → graphemeIndex`, tìm term trên chuỗi chuẩn hoá tái dựng rồi
 * ánh xạ ngược về grapheme của bản gốc → snippet giữ NGUYÊN dấu (DU-01).
 *
 * `highlights[].start/end` tính theo UTF-16 code unit của `snippet` (khớp `slice()`
 * của JS/React Native), luôn nằm trên ranh giới grapheme.
 */

const SEGMENTER = new Intl.Segmenter("vi", { granularity: "grapheme" });
const WHITESPACE_RE = /^\s+$/;
/** Khớp `modules/mentions/mention.parser.ts` (`@{u:<24 hex>}`, `@{all}`, `@{r:ADMIN|MEMBER}`) — không import chéo module. */
const MARKER_RE = /@\{(?:u:([0-9a-fA-F]{24})|all|r:(ADMIN|MEMBER))\}/g;
const ELLIPSIS = "…";

function graphemesOf(text: string): string[] {
  return Array.from(SEGMENTER.segment(text), (s) => s.segment);
}

/**
 * Thay marker mention bằng `@nhãn` — cùng quy tắc `MentionService` dùng để dựng
 * `textForSearch` (USER: tên lúc gửi, thiếu → "người dùng"; ALL: "tất cả"; ROLE: mã vai trò).
 */
export function buildDisplayText(content: string, mentions: readonly MentionRef[]): string {
  return content.replace(MARKER_RE, (_match: string, userId?: string, role?: string) => {
    if (userId) {
      const wanted = userId.toLowerCase();
      const found = mentions.find((m) => m.type === "USER" && m.targetId?.toLowerCase() === wanted);
      return `@${found?.label ?? "người dùng"}`;
    }
    if (role) return `@${role}`;
    return "@tất cả";
  });
}

interface NormalizedText {
  graphemes: string[];
  norm: string;
  /** Với mỗi code unit của `norm`: chỉ số grapheme của `display` sinh ra nó. */
  normToGrapheme: number[];
}

function normalizeByGrapheme(display: string): NormalizedText {
  const graphemes = graphemesOf(display);
  const normToGrapheme: number[] = [];
  let norm = "";
  let lastWasSpace = true; // bỏ khoảng trắng đầu chuỗi (giống `trim()` của normalizeSearch)
  graphemes.forEach((g, gi) => {
    if (WHITESPACE_RE.test(g)) {
      if (!lastWasSpace) {
        norm += " ";
        normToGrapheme.push(gi);
        lastWasSpace = true;
      }
      return;
    }
    const n = normalizeSearch(g);
    if (n.length === 0) return; // grapheme chỉ gồm dấu tổ hợp bị bỏ khi chuẩn hoá
    for (let i = 0; i < n.length; i += 1) normToGrapheme.push(gi);
    norm += n;
    lastWasSpace = n.endsWith(" ");
  });
  return { graphemes, norm, normToGrapheme };
}

interface GraphemeRange {
  gs: number;
  ge: number;
}

const WORD_CHAR_RE = /[a-z0-9]/;

/** `wordStart`: chỉ tính chỗ khớp ở ĐẦU một từ (trước nó là đầu chuỗi/ký tự không phải `a-z0-9`) — cùng ngữ nghĩa regex neo đầu từ của tìm toàn workspace (p5-04). */
function findTermRanges(text: NormalizedText, term: string, wordStart: boolean): GraphemeRange[] {
  const ranges: GraphemeRange[] = [];
  if (term.length === 0) return ranges;
  let from = 0;
  for (;;) {
    const idx = text.norm.indexOf(term, from);
    if (idx < 0) break;
    from = idx + term.length;
    if (wordStart && idx > 0 && WORD_CHAR_RE.test(text.norm[idx - 1])) continue;
    ranges.push({ gs: text.normToGrapheme[idx], ge: text.normToGrapheme[idx + term.length - 1] + 1 });
  }
  return ranges;
}

function mergeRanges(ranges: GraphemeRange[]): GraphemeRange[] {
  const sorted = [...ranges].sort((a, b) => a.gs - b.gs || a.ge - b.ge);
  const merged: GraphemeRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.gs <= last.ge) last.ge = Math.max(last.ge, r.ge);
    else merged.push({ ...r });
  }
  return merged;
}

export interface Snippet {
  snippet: string;
  highlights: SearchHighlight[];
}

/**
 * @param terms các từ ĐÃ `normalizeSearch` (thường, không dấu, không khoảng trắng).
 * @param maxGraphemes độ dài tối đa (grapheme) của phần thân snippet, chưa tính `…` đầu/cuối.
 */
export function buildSnippet(
  content: string | null,
  mentions: readonly MentionRef[],
  terms: readonly string[],
  maxGraphemes: number = LIMITS.search.snippetChars,
  opts: { wordStart?: boolean } = {}
): Snippet {
  if (!content) return { snippet: "", highlights: [] };

  const text = normalizeByGrapheme(buildDisplayText(content, mentions));
  const total = text.graphemes.length;

  const perTerm = terms.map((t) => findTermRanges(text, t, opts.wordStart === true));
  const highlightsG = mergeRanges(perTerm.flat());
  const anchor = perTerm.find((r) => r.length > 0)?.[0] ?? null;

  let a = 0;
  let b = total;
  if (total > maxGraphemes) {
    if (anchor) {
      const len = Math.min(anchor.ge - anchor.gs, maxGraphemes);
      a = Math.max(0, anchor.gs - Math.floor((maxGraphemes - len) / 2));
    }
    b = Math.min(total, a + maxGraphemes);
    a = Math.max(0, b - maxGraphemes);
  }

  let out = a > 0 ? ELLIPSIS : "";
  let lastOutSpace = a === 0; // đầu snippet thật: bỏ khoảng trắng đầu
  const outStart: number[] = [];
  const outEnd: number[] = [];
  for (let gi = a; gi < b; gi += 1) {
    const g = text.graphemes[gi];
    outStart.push(out.length);
    if (WHITESPACE_RE.test(g)) {
      if (!lastOutSpace) {
        out += " ";
        lastOutSpace = true;
      }
    } else {
      out += g;
      lastOutSpace = false;
    }
    outEnd.push(out.length);
  }

  const highlights: SearchHighlight[] = [];
  for (const r of highlightsG) {
    const s = Math.max(r.gs, a);
    const e = Math.min(r.ge, b);
    if (s >= e) continue;
    const start = outStart[s - a];
    const end = outEnd[e - 1 - a];
    if (end > start) highlights.push({ start, end });
  }

  if (b >= total) out = out.trimEnd();
  else out += ELLIPSIS;
  return { snippet: out, highlights };
}

/**
 * Trích ngắn cho `MessagePreview.excerpt` của tin đã lưu — nội dung có chữ thì cắt
 * theo grapheme (marker mention thay bằng `@tên`); tin chỉ có tệp → "[Ảnh]",
 * "[Tệp] tên" (be.md p1-09 §5.2 bước 4). Chỉ gọi cho mục `available`.
 */
export function buildExcerpt(
  message: { content: string | null; mentions: readonly MentionRef[]; attachments: readonly AttachmentRef[] },
  maxGraphemes: number = LIMITS.search.snippetChars
): string {
  if (message.content && message.content.trim() !== "") {
    const flat = buildDisplayText(message.content, message.mentions).replace(/\s+/g, " ").trim();
    const gs = graphemesOf(flat);
    return gs.length > maxGraphemes ? gs.slice(0, maxGraphemes).join("") + ELLIPSIS : flat;
  }
  const first = message.attachments[0];
  if (!first) return "";
  switch (first.kind) {
    case "IMAGE":
      return "[Ảnh]";
    case "VIDEO":
      return "[Video]";
    case "VOICE":
      return "[Tin nhắn thoại]";
    case "AUDIO":
      return "[Âm thanh]";
    default:
      return `[Tệp] ${first.name}`;
  }
}
