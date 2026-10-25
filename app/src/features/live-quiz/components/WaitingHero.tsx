import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { HERO_SURFACE, LIVE_QUIZ_ICON, LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { MotionView } from './MotionView';
import { PulseHalo } from './PulseHalo';

/** Khối chờ của NGƯỜI CHƠI trong sảnh: đã vào phòng, chờ chủ phòng bắt đầu. Quầng mờ nhịp nhàng báo hiệu "đang chờ". */
export function WaitingHero() {
  return (
    <MotionView enter="zoom">
      <View
        accessibilityLabel="Bạn đã vào phòng. Chờ chủ phòng bắt đầu."
        accessibilityLiveRegion="polite"
        accessible
        className={cn('items-center gap-sm rounded-md p-lg', HERO_SURFACE)}
      >
        <PulseHalo>
          <IconTile name={LIVE_QUIZ_ICON} size="xl" tone={LIVE_QUIZ_TONE} />
        </PulseHalo>
        <Text className="text-center text-header-sm font-semibold text-fg-1">Bạn đã vào phòng</Text>
        <Text className="text-center text-body-md text-fg-2">Chờ chủ phòng bắt đầu…</Text>
      </View>
    </MotionView>
  );
}
