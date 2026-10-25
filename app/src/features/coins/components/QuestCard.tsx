import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type { Quest } from '../api/coins.types';
import { formatCoins } from '../utils/coin-format';
import { QuestProgressBar } from './QuestProgressBar';

export interface QuestCardProps {
  quest: Quest;
  /** Đang gửi lượt nhận CỦA nhiệm vụ này (khoá nút, không khoá các thẻ khác). */
  claiming: boolean;
  /** Mất mạng ⇒ khoá nhận (không có hàng đợi ngoại tuyến cho việc đổi số dư). */
  offline: boolean;
  onClaim: (quest: Quest) => void;
}

/**
 * Thẻ một nhiệm vụ ngày (app.md p7-02 §3): tiêu đề, mô tả, thưởng, thanh tiến độ + "2/5" bằng CHỮ, và nút nhận.
 * Nút "Nhận" KHOÁ khi chưa đạt (`claimable` từ server — không tự so `progress ≥ target` ở máy); đã nhận ⇒ nhãn "Đã nhận" (chữ + icon, không chỉ màu).
 * ⚠️ Tiêu đề nằm cạnh khối thưởng trong `flex-row` nên bọc `flex-1` — thiếu thì tiêu đề dài đẩy "+20 xu" ra khỏi mép phải.
 */
export function QuestCard({ claiming, offline, onClaim, quest }: QuestCardProps) {
  const { claimable, claimedAt, progress, target } = quest;
  const claimed = claimedAt !== null;
  // Ô icon theo TRẠNG THÁI (trang trí — trạng thái đã nói bằng chữ ở nút/nhãn bên dưới): đã nhận ⇒ dấu tích `success`;
  // đạt, chờ nhận ⇒ đồng xu `accent` (mời bấm); đang làm ⇒ đồng hồ `info`.
  const art = claimed
    ? ({ icon: 'checkmark-circle', tone: 'success' } as const)
    : claimable
      ? ({ icon: 'loyalty', tone: 'accent' } as const)
      : ({ icon: 'clock', tone: 'info' } as const);

  return (
    <Card className="gap-sm">
      <View className="flex-row items-start gap-sm">
        <IconTile name={art.icon} size="sm" tone={art.tone} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-lg font-semibold text-fg-1">{quest.quest.title}</Text>
          <Text className="text-body-md text-fg-2">{quest.quest.description}</Text>
        </View>
        <Text className="text-label-md font-semibold text-fg-brand">
          {`+${formatCoins(quest.quest.coins)}`}
        </Text>
      </View>

      <View className="gap-3xs">
        <QuestProgressBar
          accessibilityLabel={`Tiến độ: ${progress} trên ${target}`}
          progress={progress}
          target={target}
        />
        <Text className="text-caption-lg text-fg-2">{`${progress}/${target}`}</Text>
      </View>

      {claimed ? (
        <Badge
          accessibilityLabel={`Đã nhận ${formatCoins(quest.quest.coins)} từ nhiệm vụ này`}
          className="self-start"
          label="Đã nhận"
          variant="success"
        />
      ) : (
        <Button
          disabled={!claimable || offline}
          fullWidth
          label={claimable ? `Nhận ${formatCoins(quest.quest.coins)}` : 'Chưa hoàn thành'}
          loading={claiming}
          size="sm"
          onPress={() => onClaim(quest)}
        />
      )}
    </Card>
  );
}
