import type { Block, RoadmapMediaDto } from '../api/roadmap.types';

/**
 * Chú thích của hình minh hoạ trong buổi học.
 *
 * BE (`media-refs.ts`, blocksFormat 2) đổi dòng giới thiệu mockup của giáo trình thành khối `image` với `alt` là chữ
 * còn lại đã làm sạch: "Ảnh mockup mẫu: layout, vị trí badge…". App tách NHÃN trước dấu hai chấm làm tiêu đề hình và
 * phần sau làm mô tả — hai tầng chữ đọc nhanh hơn một câu dài dính liền.
 */

export interface MediaCaption {
  title: string | null;
  description: string | null;
}

/** Nhãn đứng trước dấu hai chấm, tối đa 60 ký tự ("Ảnh mockup mẫu", "Mockup tham khảo cho Project 1"). */
const LABEL = /^([^:]{2,60}?)\s*:\s*(.*)$/;
const SHORT_TITLE_CHARS = 60;

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function parseMediaCaption(text: string | null | undefined): MediaCaption {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return { description: null, title: null };
  const match = LABEL.exec(clean);
  if (match?.[1]) {
    const description = (match[2] ?? '').trim();
    return { description: description ? capitalize(description) : null, title: match[1].trim() };
  }
  return clean.length <= SHORT_TITLE_CHARS
    ? { description: null, title: clean }
    : { description: clean, title: null };
}

/** `homework/product-card-mockup.svg` → "Product card mockup". */
export function prettyFileName(fileName: string): string {
  const base = (fileName.split(/[/\\]/).pop() ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
  return capitalize(base);
}

/** Tên ngắn của MỘT media: chú thích admin → tên tệp gốc → "Hình N" (thứ tự trong buổi). */
export function mediaLabel(media: RoadmapMediaDto, index: number): string {
  const caption = media.caption?.trim();
  if (caption) return caption;
  const pretty = media.fileName ? prettyFileName(media.fileName) : '';
  return pretty || `Hình ${String(index + 1)}`;
}

/** Duyệt MỌI khối theo thứ tự đọc — kể cả lồng trong danh sách, trích dẫn, khối thu gọn. */
function forEachBlock(blocks: readonly Block[], visit: (block: Block) => void): void {
  for (const block of blocks) {
    visit(block);
    if (block.type === 'list') for (const item of block.items) forEachBlock(item, visit);
    if (block.type === 'quote' || block.type === 'details') forEachBlock(block.blocks, visit);
  }
}

/** `mediaId` → `alt` của khối ảnh ĐẦU TIÊN trỏ tới nó — chú thích cho tab Hình ảnh và màn xem ảnh. */
export function collectImageAlts(blocks: readonly Block[]): Map<string, string> {
  const alts = new Map<string, string>();
  forEachBlock(blocks, (block) => {
    if (block.type === 'image' && block.mediaId && block.alt && !alts.has(block.mediaId)) {
      alts.set(block.mediaId, block.alt);
    }
  });
  return alts;
}

/**
 * Khối ảnh ĐẦU TIÊN của mỗi media. Giáo trình nhắc lại cùng một mockup 2–3 lần (phần bài tập, rồi danh sách "Tài
 * nguyên kèm theo"/"Xem … để chi tiết") — vẽ lại ảnh lớn mỗi lần là hai màn hình cùng một hình; lần nhắc sau hiện
 * dạng dòng gọn có ảnh nhỏ (`MediaRefRow`).
 */
export function primaryImageBlocks(blocks: readonly Block[]): Set<Block> {
  const seen = new Set<string>();
  const primary = new Set<Block>();
  forEachBlock(blocks, (block) => {
    if (block.type !== 'image' || !block.mediaId || seen.has(block.mediaId)) return;
    seen.add(block.mediaId);
    primary.add(block);
  });
  return primary;
}
