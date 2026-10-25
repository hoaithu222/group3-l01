import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { ResourceType } from '../api';

export interface ResourceTypeMeta {
  icon: IconName;
  /** Chữ đi KÈM icon — loại tệp không được chỉ thể hiện bằng hình/màu (app.md §7). */
  label: string;
  /**
   * Tông của ô icon khi KHÔNG có ảnh (`ResourceThumb` → `IconTile`) — cho lưới/danh sách nhìn ra loại tệp nhanh hơn một
   * bảng icon xám. ⚠️ Trang trí: chữ `label` vẫn là dấu hiệu chính. ⛔ Không dùng `danger` (để dành cho hành động phá huỷ).
   */
  tone: IconTileTone;
}

/**
 * Loại tệp → icon + nhãn.
 *
 * ⚠️ Bộ icon BIDV KHÔNG có `pdf`/`video`/`code`/`folder` (đã `ls assets/icons/system`).
 * Dùng tên gần nhất — nhãn chữ bên cạnh mới là dấu hiệu phân biệt chính. Cần
 * icon riêng thì xuất thêm từ Figma (⛔ đừng tự vẽ), rồi đổi ở ĐÚNG bảng này.
 */
export const RESOURCE_TYPE_META: Record<ResourceType, ResourceTypeMeta> = {
  PDF: { icon: 'document', label: 'PDF', tone: 'brand' },
  IMAGE: { icon: 'image', label: 'Ảnh', tone: 'success' },
  VIDEO: { icon: 'play', label: 'Video', tone: 'info' },
  AUDIO: { icon: 'audio', label: 'Âm thanh', tone: 'warning' },
  CODE: { icon: 'document-2', label: 'Mã nguồn', tone: 'neutral' },
  DOC: { icon: 'document', label: 'Văn bản Word', tone: 'info' },
  SHEET: { icon: 'document-2', label: 'Bảng tính', tone: 'success' },
  SLIDE: { icon: 'document-2', label: 'Trình chiếu', tone: 'warning' },
  TEXT: { icon: 'document-2', label: 'Văn bản', tone: 'neutral' },
  OTHER: { icon: 'file-2', label: 'Tệp', tone: 'neutral' },
};

/** Thư mục: tông `accent` (vàng nâu — màu "bìa hồ sơ"), tách hẳn khỏi các tông của tệp. */
export const FOLDER_META: ResourceTypeMeta = { icon: 'book', label: 'Thư mục', tone: 'accent' };

/** Chip lọc loại ở `ExplorerToolbar` — "Tất cả" đứng đầu. */
export const TYPE_FILTERS: readonly { key: ResourceType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'PDF', label: 'PDF' },
  { key: 'IMAGE', label: 'Ảnh' },
  { key: 'VIDEO', label: 'Video' },
  { key: 'AUDIO', label: 'Âm thanh' },
  { key: 'CODE', label: 'Mã nguồn' },
  { key: 'DOC', label: 'Word' },
  { key: 'SHEET', label: 'Bảng tính' },
  { key: 'SLIDE', label: 'Trình chiếu' },
  { key: 'TEXT', label: 'Văn bản' },
];

export function resourceTypeMeta(type: ResourceType): ResourceTypeMeta {
  return RESOURCE_TYPE_META[type] ?? RESOURCE_TYPE_META.OTHER;
}
