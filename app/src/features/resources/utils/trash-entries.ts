import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { TrashPage } from '../api';
import { formatSize } from './format-size';
import { FOLDER_META, resourceTypeMeta } from './resource-icon';
import { trashDaysLabel, trashDaysLeft } from './trash';

export interface TrashEntry {
  /** BE tính: người xem có xoá vĩnh viễn ngay được không (OWNER/ADMIN). */
  canPurge: boolean;
  /** BE tính: OWNER/ADMIN hoặc chính người đã xoá. */
  canRestore: boolean;
  /** Nhãn còn-bao-nhiêu-ngày — chữ, không chỉ màu. */
  daysLabel: string;
  icon: IconName;
  id: string;
  key: string;
  kind: 'folder' | 'resource';
  name: string;
  subtitle: string;
  /** Tông ô icon theo loại (xem `ResourceTypeMeta.tone`). */
  tone: IconTileTone;
}

/**
 * Gộp thư mục + tệp trong thùng rác thành MỘT danh sách, **thư mục trước**, mỗi
 * nhóm mới xoá nhất lên đầu. BE chỉ trả GỐC của mỗi lô xoá (tệp/thư mục con xoá cùng
 * thư mục cha không liệt kê lẻ; khôi phục thư mục là khôi phục cả lô). "Còn N ngày" và
 * quyền khôi phục/xoá hẳn đọc từ `purgeAt`/`canRestore`/`canPurge` của BE.
 */
export function buildTrashEntries(
  pages: readonly Pick<TrashPage, 'folders' | 'resources'>[],
  now: number = Date.now(),
): TrashEntry[] {
  const byDeletedDesc = <T extends { deletedAt: string | null }>(a: T, b: T) =>
    (Date.parse(b.deletedAt ?? '') || 0) - (Date.parse(a.deletedAt ?? '') || 0);

  const seen = new Set<string>();
  const entries: TrashEntry[] = [];
  const push = (entry: TrashEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    entries.push(entry);
  };

  pages
    .flatMap((page) => page.folders)
    .sort(byDeletedDesc)
    .forEach((folder) =>
      push({
        canPurge: folder.canPurge,
        canRestore: folder.canRestore,
        daysLabel: trashDaysLabel(trashDaysLeft(folder.purgeAt, now)),
        icon: FOLDER_META.icon,
        id: folder.id,
        key: `f:${folder.id}`,
        kind: 'folder',
        name: folder.name,
        subtitle: FOLDER_META.label,
        tone: FOLDER_META.tone,
      }),
    );

  pages
    .flatMap((page) => page.resources)
    .sort(byDeletedDesc)
    .forEach((resource) => {
      const meta = resourceTypeMeta(resource.type);
      push({
        canPurge: resource.canPurge,
        canRestore: resource.canRestore,
        daysLabel: trashDaysLabel(trashDaysLeft(resource.purgeAt, now)),
        icon: meta.icon,
        id: resource.id,
        key: `r:${resource.id}`,
        kind: 'resource',
        name: resource.name,
        subtitle: `${meta.label} · ${formatSize(resource.size)}`,
        tone: meta.tone,
      });
    });

  return entries;
}
