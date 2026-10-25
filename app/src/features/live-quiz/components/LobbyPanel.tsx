import { Share, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';

import type { QuizPlayerDto } from '../api/live-quiz.types';
import { liveDeepLink } from '../utils/live-quiz-links';
import { PinCard } from './PinCard';
import { PlayerChip } from './PlayerChip';
import { WaitingHero } from './WaitingHero';

interface LobbyPanelProps {
  isHost: boolean;
  kickingId?: string;
  pin?: string;
  players: QuizPlayerDto[];
  onKick?: (userId: string) => void;
}

/**
 * Sảnh chờ: chủ phòng thấy thẻ PIN cỡ lớn (mỗi số một ô, tách hai nhóm 3) + chia sẻ; người chơi thấy khối "Bạn đã vào phòng".
 * Dưới là số người đã vào (huy hiệu, đọc `polite` khi đổi) và các viên thuốc avatar+tên — người mới nảy nhẹ vào. Hành động
 * chính của chủ phòng ("Bắt đầu") nằm ở thanh đáy của `SessionScreen`, không lặp ở đây (chỉ MỘT hành động chính).
 */
export function LobbyPanel({ isHost, kickingId, pin, players, onKick }: LobbyPanelProps) {
  function share(): void {
    if (!pin) return;
    void Share.share({
      message: `Vào phòng thi trực tiếp bằng mã PIN ${pin}. Mở nhanh: ${liveDeepLink(pin)}`,
    });
  }

  return (
    <View className="gap-md">
      {isHost && pin ? <PinCard pin={pin} onShare={share} /> : <WaitingHero />}

      <View className="gap-sm">
        <View className="flex-row items-center justify-between gap-sm">
          <Text accessibilityRole="header" className="text-label-lg text-fg-1">
            Người chơi
          </Text>
          <View accessibilityLiveRegion="polite">
            <Badge
              accessibilityLabel={`${String(players.length)} người chơi trong phòng`}
              label={`${String(players.length)} người`}
              variant="warning"
            />
          </View>
        </View>
        {players.length === 0 ? (
          <View className="flex-row items-center gap-xs rounded-md bg-surface-neutral p-md">
            <Icon color="fg-2" name="user-add" size="md" />
            <Text className="flex-1 text-body-md text-fg-2">Chờ người chơi vào…</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-xs">
            {players.map((player, index) => (
              <PlayerChip
                key={player.userId}
                index={index}
                kicking={kickingId === player.userId}
                name={player.nickname}
                onKick={isHost && onKick ? () => onKick(player.userId) : undefined}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
