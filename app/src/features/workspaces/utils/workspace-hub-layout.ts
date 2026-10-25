import { WORKSPACE_HUB_TILE_KEYS } from '../constants/workspace-hub.constants';
import type { WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';

/** Ít hơn số ô này thì không dựng lưới: MỘT ô đứng trơ trọi giữa thẻ trông như lỗi, một dòng danh sách đọc rõ hơn. */
const MIN_GRID_TILES = 2;

export interface WorkspaceHubLayout {
  /** Lối vào dạng DÒNG (có mô tả) dưới lưới — giữ nguyên thứ tự của `useWorkspaceHubEntries`. */
  rows: WorkspaceHubEntry[];
  /** Lối vào dạng Ô của lưới — giữ nguyên thứ tự của `useWorkspaceHubEntries`. */
  tiles: WorkspaceHubEntry[];
}

/**
 * Chia các lối vào ĐÃ LỌC thành ô lưới (`WORKSPACE_HUB_TILE_KEYS`) và dòng danh sách (phần còn lại). Không lọc thêm gì —
 * mọi mục vào được đây đều được vẽ, chỉ khác chỗ đặt. Dưới `MIN_GRID_TILES` ô (vd khách chỉ có "Kênh") thì mọi mục thành dòng.
 */
export function splitHubEntries(entries: readonly WorkspaceHubEntry[]): WorkspaceHubLayout {
  const tiles = entries.filter((entry) => WORKSPACE_HUB_TILE_KEYS.has(entry.key));
  if (tiles.length < MIN_GRID_TILES) return { rows: [...entries], tiles: [] };
  return { rows: entries.filter((entry) => !WORKSPACE_HUB_TILE_KEYS.has(entry.key)), tiles };
}

/**
 * Nhãn trợ năng của một lối vào — CÙNG một câu cho ô lưới và dòng danh sách: "Kênh. Xem và tham gia…, 3 chưa đọc". Ô lưới
 * không in mô tả ra màn (chật), nên câu đọc lên là chỗ DUY NHẤT người dùng trình đọc màn hình nghe được ô đó làm gì.
 */
export function hubEntryA11yLabel({
  badge,
  description,
  label,
}: Pick<WorkspaceHubEntry, 'badge' | 'description' | 'label'>): string {
  const name = description ? `${label}. ${description}` : label;
  return badge ? `${name}, ${String(badge)} chưa đọc` : name;
}
