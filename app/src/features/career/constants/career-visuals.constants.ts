import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Nhận diện của phân hệ Nghề nghiệp (không có ô ở Trang chủ — vào từ hàng "Nghề nghiệp" màn Tôi): icon + tông DÙNG CHUNG cho hàng ở màn
 * Tôi (`CareerMeRow`), dải đầu màn Nghề nghiệp và các ô lối vào — một phân hệ, một nhận diện.
 *
 * ⚠️ `analytics-02` (biểu đồ đi lên — "phát triển nghề nghiệp") chỉ có bản HAI TÔNG: dùng qua `IconTile`/`ModuleBanner`/`Section icon`
 * (đều vẽ `twotone`). Tông `info` khác `accent` của "Thành tích" (ngôi sao) đứng ngay cạnh ở màn Tôi.
 */
export const CAREER_ICON: IconName = 'analytics-02';
export const CAREER_TONE: IconTileTone = 'info';

/**
 * Icon cho từng dòng "Số liệu hệ thống ghi nhận" (`snapshotStats` → `key`) — mốc nhìn khi quét một cột số. Chỉ bổ trợ: nhãn + giá trị
 * vẫn đọc liền thành câu ở `ListItem`. Khoá lạ rơi về `chart-1`.
 */
export const SNAPSHOT_STAT_VISUAL: Partial<Record<string, { icon: IconName; tone: IconTileTone }>> = {
  contrib: { icon: 'chart-1', tone: 'brand' },
  files: { icon: 'file-2', tone: 'neutral' },
  ontime: { icon: 'clock', tone: 'success' },
  points: { icon: 'star', tone: 'accent' },
  review: { icon: 'favorite', tone: 'warning' },
  share: { icon: 'analytics-02', tone: 'info' },
  tasks: { icon: 'checkmark-square', tone: 'success' },
  team: { icon: 'add-team', tone: 'info' },
};

export const SNAPSHOT_STAT_FALLBACK = { icon: 'chart-1' as IconName, tone: 'neutral' as IconTileTone };
