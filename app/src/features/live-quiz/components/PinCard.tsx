import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { HERO_SURFACE } from '../constants/live-quiz-visuals';
import { pinGroups } from '../utils/pin-format';
import { MotionView } from './MotionView';

interface PinCardProps {
  pin: string;
  onShare: () => void;
}

/**
 * Thẻ MÃ PIN của chủ phòng — thứ to nhất màn sảnh chờ, để chiếu lên màn hình lớp học: mỗi chữ số một ô, tách hai nhóm 3 số
 * (`123 456`) cho dễ đọc to. Cả dãy là MỘT ô trợ năng ("Mã PIN 1 2 3 4 5 6" — đọc từng chữ số, không đọc "một trăm hai mươi ba…").
 * Ô số co theo bề rộng (`flex-1` + trần) nên máy 320dp không tràn; ⛔ không viết bề rộng cứng.
 */
export function PinCard({ onShare, pin }: PinCardProps) {
  return (
    <MotionView enter="zoom">
      <View className={cn('items-center gap-sm rounded-md p-md tablet:p-lg', HERO_SURFACE)}>
        <View className="flex-row items-center gap-xs">
          <Icon color="warning" name="flash" size="sm" variant="twotone" />
          <Text className="text-label-lg text-fg-1">Mã PIN vào phòng</Text>
        </View>
        <View
          accessibilityLabel={`Mã PIN ${pin.split('').join(' ')}`}
          accessible
          className="w-full flex-row items-center justify-center gap-md"
        >
          {pinGroups(pin).map((group, groupIndex) => (
            <View
              key={`${String(groupIndex)}-${group}`}
              className="flex-1 flex-row justify-center gap-2xs"
            >
              {group.split('').map((digit, digitIndex) => (
                <View
                  key={`${String(digitIndex)}-${digit}`}
                  className="h-16 max-w-14 flex-1 items-center justify-center rounded-xs border-hairline border-border-warning-subtle bg-bg-1"
                >
                  <Text
                    className="text-header-lg font-bold text-fg-1 tablet:text-display"
                    maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                  >
                    {digit}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <Text className="text-center text-caption-lg text-fg-2">
          Người chơi mở mục Thi đấu trực tiếp và nhập mã này để vào phòng.
        </Text>
        <Button
          iconLeft="share"
          label="Chia sẻ mã"
          size="sm"
          variant="warning-secondary"
          onPress={onShare}
        />
      </View>
    </MotionView>
  );
}
