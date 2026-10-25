import { formatDate } from '@/shared/utils/format/date.utils';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { ExplorerItem } from './explorer-items';
import { formatSize } from './format-size';
import { FOLDER_META, resourceTypeMeta } from './resource-icon';

export interface ItemView {
  icon: IconName;
  /** Đường dẫn thư mục (chỉ tệp trong kết quả tìm, nếu BE trả). */
  path?: string;
  subtitle: string;
  thumbnailUrl?: string | null;
  title: string;
  /** Tông ô icon khi không có ảnh (xem `ResourceTypeMeta.tone`). */
  tone: IconTileTone;
  /** Nhãn loại đi KÈM icon — loại tệp không chỉ thể hiện bằng hình/màu. */
  typeLabel: string;
}

/**
 * Một dòng mô tả cho ô lưới/dòng danh sách. Tệp luôn hiện NGÀY: kho cho phép
 * trùng tên tệp trong một thư mục (README §2), nên ngày là thứ duy nhất phân
 * biệt hai bản "Slide.pdf".
 */
export function describeItem(item: ExplorerItem): ItemView {
  if (item.kind === 'folder') {
    return {
      icon: FOLDER_META.icon,
      subtitle: FOLDER_META.label,
      title: item.folder.name,
      tone: FOLDER_META.tone,
      typeLabel: FOLDER_META.label,
    };
  }
  const { resource } = item;
  const meta = resourceTypeMeta(resource.type);
  return {
    icon: meta.icon,
    path: resource.folderPath ?? undefined,
    subtitle: [meta.label, formatSize(resource.size), formatDate(resource.createdAt)]
      .filter(Boolean)
      .join(' · '),
    thumbnailUrl: resource.type === 'IMAGE' ? resource.thumbnailUrl : undefined,
    title: resource.name,
    tone: meta.tone,
    typeLabel: meta.label,
  };
}

/** Nhãn trợ năng đầy đủ của một ô: tên, loại, dung lượng/ngày — người dùng đọc màn hình không thấy icon. */
export function itemAccessibilityLabel(view: ItemView): string {
  return `${view.title}, ${view.subtitle}${view.path ? `, trong ${view.path}` : ''}`;
}
