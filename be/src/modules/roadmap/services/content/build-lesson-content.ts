import { createHash } from "crypto";
import { LIMITS } from "../../../../core/constants/limits";
import { nanoid } from "../../../../core/utils/nanoid";
import type { Block } from "../../entities/block.interface";
import type { RoadmapChecklistItem, RoadmapResource } from "../../entities/lesson.interface";
import { markdownToBlocks } from "./md-to-blocks";
import { splitLessonSections } from "./lesson-sections";

export interface MediaRef {
  id: string;
  /** Đường dẫn/tên tệp trong nguồn — chỉ dùng `basename` để khớp link trong bài. */
  sourcePath: string;
}

export interface BuiltLessonContent {
  title: string | null;
  durationMinutes: number | null;
  prerequisites: string | null;
  objectives: string[];
  bodyMd: string;
  blocks: Block[];
  checklist: RoadmapChecklistItem[];
  resources: RoadmapResource[];
  warnings: string[];
}

function basename(path: string): string {
  const clean = path.split(/[?#]/)[0];
  const parts = clean.split(/[/\\]/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

/** "k_" + 8 ký tự băm của (group + text) — ỔN ĐỊNH khi import lại (nội dung không đổi thì id không đổi, không mất tick của người học). */
function checklistItemId(group: string | null, text: string): string {
  const hash = createHash("sha1").update(`${group ?? ""}\u0000${text}`).digest("hex").slice(0, 8);
  return `k_${hash}`;
}

/**
 * Ghép `lesson-sections.ts` (tách mục) + `md-to-blocks.ts` (dựng khối) — dùng chung cho import và admin lưu bài
 * (be.md §5.2 → §5.1). `media` là danh sách media ĐÃ CÓ của buổi (import tạo trước, admin đọc từ DB) để khớp ảnh
 * trong bài; không truyền = rỗng (đoạn có link ảnh vẫn hiển thị bình thường dưới dạng link, không vỡ).
 */
export function buildLessonContent(rawMd: string, media: readonly MediaRef[] = []): BuiltLessonContent {
  if (rawMd.length > LIMITS.roadmap.bodyMdMaxChars) {
    throw new Error(`Nội dung buổi học vượt ${LIMITS.roadmap.bodyMdMaxChars} ký tự`);
  }
  const sections = splitLessonSections(rawMd);
  const mediaByBasename = new Map(media.map((m) => [basename(m.sourcePath), m.id]));
  const blockWarnings: string[] = [];
  const blocks = markdownToBlocks(sections.bodyMd, mediaByBasename, blockWarnings);

  const seenChecklist = new Set<string>();
  const checklist: RoadmapChecklistItem[] = sections.checklist.map((c) => {
    let id = checklistItemId(c.group, c.text);
    while (seenChecklist.has(id)) id = `${id}${nanoid(2)}`;
    seenChecklist.add(id);
    return { id, text: c.text, group: c.group };
  });

  const resources: RoadmapResource[] = sections.resources.map((r, i) => ({
    id: `r_${nanoid(8)}`,
    kind: r.kind,
    group: r.group,
    title: r.title,
    url: r.url,
    assetId: null,
    note: r.note,
    bodyMd: r.bodyMd,
    order: (i + 1) * 1024,
  }));

  return {
    title: sections.title,
    durationMinutes: sections.durationMinutes,
    prerequisites: sections.prerequisites,
    objectives: sections.objectives,
    bodyMd: sections.bodyMd,
    blocks,
    checklist,
    resources,
    warnings: [...sections.warnings, ...blockWarnings],
  };
}
