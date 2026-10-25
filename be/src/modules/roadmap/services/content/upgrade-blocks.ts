import { BLOCKS_FORMAT_VERSION, type Block } from "../../entities/block.interface";
import type { RoadmapLesson } from "../../entities/lesson.interface";
import type { RoadmapMedia } from "../../entities/media.interface";
import { markdownToBlocks } from "./md-to-blocks";
import { fileBasename } from "./media-refs";

/** Số buổi giữ bản dựng lại trong bộ nhớ — cả giáo trình Fullstack (56 buổi) vừa đủ, tốn chỉ vài MB. */
const CACHE_MAX = 64;
const cache = new Map<string, Block[]>();

/** Buổi lưu `blocks` bằng cách dựng CŨ (`blocksFormat` < hiện tại) mà còn `bodyMd` để dựng lại. */
export function needsBlocksUpgrade(lesson: Pick<RoadmapLesson, "blocksFormat" | "bodyMd">): boolean {
  return lesson.blocksFormat < BLOCKS_FORMAT_VERSION && lesson.bodyMd.trim().length > 0;
}

/**
 * Dựng lại `blocks` từ `bodyMd` bằng pipeline HIỆN TẠI lúc ĐỌC — buổi import trước khi `md-to-blocks` biết đổi link
 * mockup thành ảnh/giải mã thực thể HTML vẫn hiện đúng ngay, không bắt chạy lại import (`--overwrite` còn xoá/tạo lại
 * media và ghi đè bài admin đã sửa). Chạy lại import/lưu bài ở admin sẽ ghi bản mới vào DB và bỏ qua đường này.
 *
 * ⚠️ Khoá cache gồm `version` của buổi VÀ danh sách media: admin thêm/xoá ảnh không tăng `version` của buổi, thiếu nó
 * thì ảnh mới tải lên vẫn hiện là chữ tới khi khởi động lại máy chủ. ⛔ Không sửa mảng trả về (dùng chung giữa request).
 */
export function upgradeLessonBlocks(
  lesson: Pick<RoadmapLesson, "id" | "version" | "bodyMd">,
  media: readonly Pick<RoadmapMedia, "id" | "sourcePath">[]
): Block[] {
  const key = `${lesson.id}:${String(lesson.version)}:${media.map((m) => `${m.id}=${m.sourcePath ?? ""}`).join("|")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // `sourcePath ?? id` — cùng quy ước với `admin-lesson.service.ts` (ảnh admin tải lên không có tệp nguồn).
  const byName = new Map(media.map((m) => [fileBasename(m.sourcePath ?? m.id).toLowerCase(), m.id]));
  const blocks = markdownToBlocks(lesson.bodyMd, byName, []);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, blocks);
  return blocks;
}
