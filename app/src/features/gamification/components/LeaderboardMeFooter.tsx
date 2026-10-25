import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { LeaderboardDto } from '../api/gamification.types';
import { formatXp } from '../utils/level-math';

export interface LeaderboardMeFooterProps {
  me: LeaderboardDto['me'];
  /** Đang gửi "Hiện lại". */
  pending?: boolean;
  /** Bật lại `showInLeaderboard` — chỉ hiện nút khi `me.hidden`. */
  onShow?: () => void;
}

/** Dòng ghim đáy: "Bạn: hạng 12 · 340 XP" hoặc "Bạn đang ẩn khỏi bảng xếp hạng" kèm nút đổi (app.md p4-03 §3). */
export function LeaderboardMeFooter({ me, onShow, pending }: LeaderboardMeFooterProps) {
  const line = me.hidden
    ? 'Bạn đang ẩn khỏi bảng xếp hạng'
    : me.rank
      ? `Bạn: hạng ${me.rank} · ${formatXp(me.xp)}`
      : `Bạn chưa có hạng trong kỳ này · ${formatXp(me.xp)}`;

  // ⛔ `BottomActionBar` chứ không phải `<View>` trần: dòng này nằm ở `footer` của `Screen`, nơi KHÔNG ai đệm vùng an toàn
  // ngoài chính thanh đáy — `<View>` trần đè lên vạch gạt ngang, và nút "Hiện lại" bị hệ điều hành nuốt cú chạm.
  return (
    <BottomActionBar divider>
      <View className="flex-row items-center gap-sm">
        {/* Ô icon trang trí: ngôi sao (tông Thành tích) khi đang có mặt trên bảng, con mắt gạch khi đang ẩn — trạng thái vẫn
            nói bằng CHỮ ở dòng bên cạnh. */}
        <IconTile
          name={me.hidden ? 'hide' : 'star'}
          size="sm"
          tone={me.hidden ? 'neutral' : 'accent'}
        />
        <Text className="flex-1 text-body-md font-semibold text-fg-1">{line}</Text>
        {me.hidden && onShow ? (
          <Button
            accessibilityLabel="Hiện tôi trong bảng xếp hạng nhóm"
            label="Hiện lại"
            loading={pending}
            size="sm"
            variant="secondary"
            onPress={onShow}
          />
        ) : null}
      </View>
    </BottomActionBar>
  );
}
