import { normalizeSearch } from "../../../../core/utils/normalize";

export interface ParsedResource {
  kind: "LINK" | "VIDEO" | "TOOL" | "FILE" | "NOTE";
  group: string | null;
  title: string;
  url: string | null;
  note: string | null;
  bodyMd: string | null;
}

export interface ParsedChecklistItem {
  text: string;
  group: string | null;
}

export interface LessonSections {
  title: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  bodyMd: string;
  checklist: ParsedChecklistItem[];
  resources: ParsedResource[];
  warnings: string[];
}

interface Chunk {
  /** null = phần mở đầu trước H2 đầu tiên (chứa H1 + blockquote metadata). */
  headingRaw: string | null;
  body: string;
}

const EMOJI_AND_NUM = /^[\s#>*]*(?:[\d.]+[.)]?\s*)?[\p{Emoji_Presentation}\p{Extended_Pictographic}️‍]*\s*/u;

function normalizeHeading(raw: string): string {
  return normalizeSearch(raw.replace(EMOJI_AND_NUM, "").replace(/\*\*/g, "")).trim();
}

function splitByH2(md: string): Chunk[] {
  const lines = md.split("\n");
  const chunks: Chunk[] = [];
  let current: Chunk = { headingRaw: null, body: "" };
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (!inFence && /^##\s+/.test(line)) {
      chunks.push(current);
      current = { headingRaw: line.replace(/^##\s+/, "").trim(), body: "" };
      continue;
    }
    current.body += line + "\n";
  }
  chunks.push(current);
  return chunks;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[-*]\s+/, "").replace(/^\*\*(.+?)\*\*\s*/, "$1 ").trim();
}

function parseDuration(text: string): number | null {
  const h = /(\d+)\s*tiếng/i.exec(text);
  const m = /(\d+)\s*phút/i.exec(text);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

function parseObjectives(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map(stripBullet)
    .filter(Boolean);
}

/** H3 trong mục Checklist → nhóm; dòng `- [ ]`/`- [x]` bên dưới → mục (bỏ trạng thái đã tick khi import — người học tự tick lại). */
function parseChecklist(body: string): ParsedChecklistItem[] {
  const items: ParsedChecklistItem[] = [];
  let group: string | null = null;
  for (const line of body.split("\n")) {
    const h3 = /^###\s+(.+)/.exec(line);
    if (h3) {
      group = h3[1].replace(EMOJI_AND_NUM, "").replace(/\*\*/g, "").trim() || null;
      continue;
    }
    const task = /^\s*[-*]\s+\[[ xX]\]\s+(.+)/.exec(line);
    if (task) items.push({ text: task[1].trim(), group });
  }
  return items;
}

const LINK_LINE = /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*(?:[—-]\s*\*?_?(.*?)\*?_?)?\s*$/;

function classifyResourceGroup(h3: string): "LINK" | "VIDEO" | "TOOL" {
  const n = normalizeHeading(h3);
  if (n.includes("video")) return "VIDEO";
  if (n.includes("cong cu") || n.includes("website") || n.includes("nang cao")) return "TOOL";
  return "LINK";
}

/**
 * Mục "Đọc thêm & Tài nguyên": mỗi H3 là một nhóm link (`- [Tiêu đề](url) — *lý do*`). Nhóm "Kết nối thực tế" (bảng +
 * câu hỏi phỏng vấn — không phải danh sách link) được giữ NGUYÊN VĂN thành 1 resource NOTE thay vì cố tách từng dòng.
 */
function parseResources(body: string, warnings: string[]): ParsedResource[] {
  const out: ParsedResource[] = [];
  const parts = body.split(/(?=^###\s+)/m).filter((p) => p.trim());
  for (const part of parts) {
    const h3Match = /^###\s+(.+)\n?/.exec(part);
    const heading = h3Match ? h3Match[1].trim() : null;
    const rest = h3Match ? part.slice(h3Match[0].length) : part;
    const normalized = heading ? normalizeHeading(heading) : "";
    if (heading && (normalized.includes("ket noi thuc te") || normalized.includes("phong van"))) {
      const text = rest.trim();
      if (text) out.push({ kind: "NOTE", group: heading.replace(EMOJI_AND_NUM, "").trim(), title: heading.replace(EMOJI_AND_NUM, "").trim(), url: null, note: null, bodyMd: text });
      continue;
    }
    const group = heading ? classifyResourceGroup(heading) : "LINK";
    const groupLabel = heading ? heading.replace(EMOJI_AND_NUM, "").replace(/\*\*/g, "").trim() : null;
    let matched = 0;
    for (const line of rest.split("\n")) {
      const m = LINK_LINE.exec(line);
      if (!m) continue;
      matched += 1;
      out.push({ kind: group, group: groupLabel, title: m[1].trim(), url: m[2].trim(), note: m[3]?.trim() || null, bodyMd: null });
    }
    if (matched === 0 && rest.trim()) warnings.push(`Không tách được link nào trong mục tài liệu "${heading ?? "(không tiêu đề)"}"`);
  }
  return out;
}

/** Dòng điều hướng cuối bài (`[<- Buổi trước](...) | [Danh sách](...) | [Buổi sau ->](...)`) — vị trí do `number` tự tính, bỏ link cũ (nhiều link hỏng). */
function stripTrailingNav(body: string): string {
  const lines = body.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end -= 1;
  if (end > 0 && (/\[<-|->\]/.test(lines[end - 1]) || /\[.*\]\(.*\)\s*\|/.test(lines[end - 1]))) {
    end -= 1;
    while (end > 0 && (lines[end - 1].trim() === "" || lines[end - 1].trim() === "---")) end -= 1;
  }
  return lines.slice(0, end).join("\n");
}

/**
 * Tách `bodyMd` gốc (nguyên văn 1 buổi, H1 + blockquote + các mục ##) thành: tiêu đề, thời lượng/yêu cầu trước (từ
 * blockquote đầu bài), mục tiêu, checklist, tài liệu — phần còn lại là thân bài cho `markdownToBlocks` (be.md §5.2).
 */
export function splitLessonSections(rawMd: string): LessonSections {
  const warnings: string[] = [];
  const chunks = splitByH2(rawMd);
  const preamble = chunks[0]?.body ?? "";

  const h1 = /^#\s+(.+)$/m.exec(preamble);
  const title = h1 ? h1[1].replace(/&amp;/g, "&").trim() : null;

  const durationLine = /^>\s*⏱️.*?Thời lượng[^:]*:\s*(.+)$/m.exec(preamble);
  const durationMinutes = durationLine ? parseDuration(durationLine[1]) : null;
  if (durationLine && durationMinutes === null) warnings.push(`Không đọc được thời lượng: "${durationLine[1].trim()}"`);

  // Lọc bỏ khỏi phần mở đầu: H1 (đã lấy làm title), dòng 🗺️ vị trí (thuần điều hướng), dòng/khối 📋 yêu cầu trước
  // (đã trích ra `prerequisites`) — khối Input/Output/Related (nếu có) GIỮ NGUYÊN trong thân bài (be.md §5.2).
  const prereqLines: string[] = [];
  const preambleKept: string[] = [];
  let inPrereq = false;
  for (const line of preamble.split("\n")) {
    if (/^#\s+.+/.test(line)) continue;
    if (/^>\s*🗺️/.test(line)) continue;
    if (/^>\s*⏱️/.test(line)) continue;
    if (/^>\s*📋/.test(line)) {
      inPrereq = true;
      const m = /Yêu cầu trước[^:]*:\s*(.*)$/.exec(line);
      if (m && m[1].trim()) prereqLines.push(m[1].trim());
      continue;
    }
    if (inPrereq && /^>\s*(Input|Output|Related)/.test(line)) inPrereq = false;
    if (inPrereq && /^>/.test(line)) {
      prereqLines.push(line.replace(/^>\s*/, "").trim());
      continue;
    }
    preambleKept.push(line);
  }
  const prerequisites = prereqLines.length > 0 ? prereqLines.join(" ") : null;

  let objectives: string[] = [];
  let checklist: ParsedChecklistItem[] = [];
  let resources: ParsedResource[] = [];
  const keptChunks: string[] = [preambleKept.join("\n").trim()];

  for (const chunk of chunks.slice(1)) {
    const norm = normalizeHeading(chunk.headingRaw ?? "");
    if (norm.includes("muc tieu")) {
      objectives = parseObjectives(chunk.body);
      continue;
    }
    if (norm.includes("checklist")) {
      checklist = parseChecklist(chunk.body);
      continue;
    }
    if (norm.includes("doc them") || norm.includes("tai nguyen")) {
      resources = parseResources(chunk.body, warnings);
      continue;
    }
    keptChunks.push(`## ${chunk.headingRaw}\n${chunk.body}`.trim());
  }

  if (objectives.length === 0) warnings.push("Không tìm thấy mục 'Mục tiêu buổi học'");
  if (checklist.length === 0) warnings.push("Không tìm thấy mục 'Checklist cuối buổi'");

  const bodyMd = stripTrailingNav(keptChunks.filter(Boolean).join("\n\n")).trim();

  return { title, durationMinutes, prerequisites, objectives, bodyMd, checklist, resources, warnings };
}
