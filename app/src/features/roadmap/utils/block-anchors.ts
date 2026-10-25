import type { Block, Span } from '../api/roadmap.types';

/** Một mục mục lục — app.md §7.3 `TocSheet` chỉ liệt H2/H3 (bỏ H4, quá vụn cho một danh sách chạm-để-cuộn). */
export interface TocEntry {
  anchor: string;
  level: 2 | 3;
  text: string;
}

/** Nối chữ thường của một dãy `Span` — dùng cho mục lục, `alt` dự phòng của ảnh, nhãn trợ năng của bảng/trích dẫn. */
export function spansToText(spans: readonly Span[]): string {
  return spans.map((span) => span.v).join('');
}

/**
 * Mục lục từ `Block[]` của MỘT buổi học — chỉ heading `level` 2/3 (H4 trở đi không vào mục lục), và CHỈ Ở CẤP
 * NGOÀI CÙNG (không đệ quy vào `list`/`table`/`quote`/`details`): nội dung nguồn của giáo trình đặt H2/H3 làm tiêu
 * đề mục thật sự ở thân bài, không lồng trong trích dẫn/khối thu gọn. Giới hạn này còn khớp với cách đo vị trí
 * cuộn tới (`ContentTab`, `onLayout`) — `y` đo được chỉ CHÍNH XÁC khi heading là con TRỰC TIẾP của danh sách khối
 * cấp ngoài cùng; heading lồng sâu hơn sẽ cần cộng dồn offset qua nhiều cấp mà `onLayout` một lớp không cho biết.
 */
export function extractToc(blocks: readonly Block[]): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const block of blocks) {
    if (block.type === 'heading' && (block.level === 2 || block.level === 3)) {
      entries.push({ anchor: block.anchor, level: block.level, text: spansToText(block.spans) });
    }
  }
  return entries;
}
