import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { cn } from '@/shared/utils/style/cn';

import type { LeaderboardEntry } from '../api/gamification.types';
import { useAvatarSource } from '../hooks/useAvatarSource';
import { formatXp } from '../utils/level-math';

export interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  /** Dòng của chính tôi — nền nhấn + hậu tố "(bạn)" trong nhãn đọc. */
  isMe?: boolean;
  /** XP của hạng 1 — mốc 100% cho thanh so sánh. `0`/thiếu ⇒ không vẽ thanh (không chia cho 0). */
  topXp?: number;
  onPress: (entry: LeaderboardEntry) => void;
}

/** Phần trăm so với hạng 1, kẹp 0–100 (dữ liệu hai kỳ lệch nhau không làm thanh tràn). */
function percentOfTop(xp: number, topXp: number): number {
  return Math.min(100, Math.max(0, Math.round((xp / topXp) * 100)));
}

/**
 * Một dòng xếp hạng: hạng bằng CHỮ (`#12`, số cùng bề rộng — cột hạng không "nhảy" giữa #9 và #10), avatar (ảnh thật khi có
 * `avatarAssetId`, không thì chữ viết tắt), tên (cắt 1 dòng, tên đủ nằm trong `accessibilityLabel`), cấp, XP. Chạm ⇒ mở hồ
 * sơ công khai. Nhãn đọc: "Hạng 4, Minh, cấp 7, 340 XP".
 *
 * ✅ Thanh mảnh "so với hạng 1" (ý tưởng `scrollRankingBoard` của dashboard tham chiếu — bỏ phần tự cuộn): mắt thấy ngay
 * khoảng cách với đầu bảng. Con số % nằm cả ở CHỮ ("67% so với #1") lẫn `accessibilityValue` — thanh chỉ là hình (ẩn khỏi
 * trình đọc màn hình), ⛔ không phải `progressbar`: đây là độ lớn TƯƠNG ĐỐI, không phải tiến độ của một việc.
 * ⚠️ Thanh TĨNH: hàng của `FlatList` được tái dùng khi cuộn — hoạt ảnh vào ở đây sẽ chạy loạn.
 *
 * `active:opacity-70`: phản hồi nhấn của hàng tự dựng (hàng danh sách dài ⛔ không co bằng `PressableScale`). Lớp gộp bằng
 * `cn()`, ⛔ không nối chuỗi — NativeWind áp theo độ ưu tiên CSS chứ không theo thứ tự trong chuỗi.
 */
export function LeaderboardRow({ entry, isMe = false, onPress, topXp = 0 }: LeaderboardRowProps) {
  const avatar = useAvatarSource(entry.avatarAssetId);
  const percent = topXp > 0 ? percentOfTop(entry.xp, topXp) : null;
  const relative = percent === null ? null : `${percent}% so với #1`;

  return (
    <Pressable
      accessibilityHint="Chạm hai lần để xem hồ sơ thành tích"
      accessibilityLabel={`Hạng ${entry.rank}, ${entry.name}${isMe ? ' (bạn)' : ''}, cấp ${entry.level}, ${formatXp(entry.xp)}`}
      accessibilityRole="button"
      accessibilityValue={relative ? { text: relative } : undefined}
      className={cn(
        'min-h-14 flex-row items-center gap-sm border-b border-border-1 px-md py-sm active:opacity-70',
        isMe && 'bg-surface-primary',
      )}
      onPress={() => onPress(entry)}
    >
      <Text className="w-10 text-center text-body-lg font-semibold tabular-nums text-fg-1">
        #{entry.rank}
      </Text>
      <Avatar name={entry.name} size="sm" source={avatar} />
      <View className="flex-1 gap-2xs">
        <Text className="text-body-md font-semibold text-fg-1" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text className="text-caption-lg text-fg-2">
          {relative ? `Cấp ${entry.level} · ${relative}` : `Cấp ${entry.level}`}
        </Text>
        {percent !== null ? (
          <View
            accessibilityElementsHidden
            className="h-1 overflow-hidden rounded-full bg-bg-3"
            importantForAccessibility="no-hide-descendants"
          >
            <View
              className={cn('h-1 rounded-full', isMe ? 'bg-action-base' : 'bg-action-base/40')}
              style={{ width: `${percent}%` }}
            />
          </View>
        ) : null}
      </View>
      <Text className="text-body-md font-semibold tabular-nums text-fg-1">
        {formatXp(entry.xp)}
      </Text>
    </Pressable>
  );
}
