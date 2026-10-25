import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { skillIconName } from '@/shared/career';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { IconTile } from '@/shared/ui/icon-tile';

import { useSkillUnlocked } from '../hooks/useSkillUnlocked';
import { skillHref } from '../utils/career-routes';

/**
 * Tấm chúc mừng huy hiệu kỹ năng mới (app.md p6-06 §3 `SkillUnlockedSheet`) — hiện khi nhận `skill:unlocked` lúc app đang mở, MỘT lần mỗi kỹ năng.
 * Không có hiệu ứng pháo giấy/chuyển động riêng (tôn trọng "giảm chuyển động" một cách mặc định). Dùng từ "huy hiệu kỹ năng xác thực", không
 * "chứng chỉ". Mount MỘT lần: `SkillUnlockedHost` ở nơi lắp ráp (`app/(app)/_layout.tsx`, cạnh `GamificationEventHost`) — ⛔ đừng gắn thêm ở màn nào khác.
 *
 * ✅ Hai nút là `SheetActions` cột dọc (chính trên — phụ dưới, cùng khe với mọi tấm khác) thay cho hai `Button` tự xếp; icon kỹ năng đặt
 * trong ô `IconTile` (tông thành công) để đầu tấm có một điểm nhìn rõ ràng thay vì một hình trần giữa khoảng trắng.
 */
export function SkillUnlockedHost() {
  const { current, dismiss } = useSkillUnlocked();

  const open = () => {
    if (!current) return;
    const id = current.skillId;
    dismiss();
    router.push(skillHref(id));
  };

  return (
    <BottomSheet
      footer={
        <SheetActions
          layout="column"
          primary={{ label: 'Xem huy hiệu', onPress: open }}
          secondary={{ label: 'Để sau', onPress: dismiss }}
        />
      }
      title="Chúc mừng!"
      visible={current !== null}
      onClose={dismiss}
    >
      {current ? (
        <View className="items-center gap-sm">
          <IconTile name={skillIconName(current.icon)} size="xl" tone="success" />
          <Text className="text-center text-body-md text-fg-1">
            {`Bạn vừa đạt huy hiệu kỹ năng xác thực ${current.name}.`}
          </Text>
          <Text className="text-center text-caption-lg text-fg-2">
            Hệ thống ghi nhận từ các task bạn đã hoàn thành — không cần tự khai.
          </Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}
