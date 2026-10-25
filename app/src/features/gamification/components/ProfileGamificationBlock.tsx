import { Text, View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';
import { useFeature } from '@/shell/capabilities';

import { useMyGamification } from '../queries/gamification.queries';
import { LevelProgressBar } from './LevelProgressBar';
import { StreakFlame } from './StreakFlame';

/**
 * Khối "cấp + chuỗi" cho thẻ hồ sơ màn Tôi (app.md p4-03 §3 dòng `Me`): `LevelProgressBar` gọn + `StreakFlame`. Tự lo mọi
 * trạng thái để nơi lắp ráp chỉ việc đặt vào: cờ `gamification` tắt ⇒ ẩn hẳn; đang tải ⇒ skeleton thanh; lỗi ⇒ ẩn khối (không
 * chặn màn Tôi); cấp 1 + 0 XP ⇒ "Hoàn thành việc đầu tiên để nhận XP"; offline ⇒ số trong cache (React Query giữ dữ liệu cũ).
 *
 * ⛔ `features/me` KHÔNG import feature này (cấm import chéo) — điều phối viên đưa khối vào màn Tôi qua khe của `shell`/`shared`
 * hoặc route, không phải qua import trực tiếp.
 */
export function ProfileGamificationBlock() {
  const enabled = useFeature('gamification') === true;
  const me = useMyGamification();

  if (!enabled) return null;
  if (me.isLoading) return <Skeleton className="h-16 rounded-md" />;
  if (!me.data) return null;

  const profile = me.data;
  return (
    <View className="gap-xs self-stretch">
      <LevelProgressBar profile={profile} />
      <StreakFlame profile={profile} />
      {profile.level <= 1 && profile.xp === 0 ? (
        <Text className="text-caption-lg text-fg-2">Hoàn thành việc đầu tiên để nhận XP</Text>
      ) : null}
    </View>
  );
}
