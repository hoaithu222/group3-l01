import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils/style/cn';

import { DecorAvatar } from './DecorAvatar';
import { MotionView } from './MotionView';

interface PlayerChipProps {
  /** Thứ tự trong danh sách — lệch nhịp hiện lần lượt khi cả phòng dựng lại. */
  index: number;
  name: string;
  /** Đang gửi lệnh "Mời ra" cho người này. */
  kicking?: boolean;
  /** Chỉ chủ phòng truyền — có thì chip có nút "Mời ra". */
  onKick?: () => void;
}

/**
 * Một người chơi trong sảnh: avatar chữ viết tắt + tên (viên thuốc). Người mới vào NẢY nhẹ vào chỗ (`MotionView zoom`, key theo
 * `userId` nên chỉ chip mới gắn mới chạy — người đã có trong phòng không nhảy lại). Chủ phòng có nút "Mời ra" icon-only trong chip;
 * nhãn trợ năng nói rõ mời AI ra ("Mời Minh Anh ra") — trước đây mỗi dòng một nút chữ chung "Mời ra".
 */
export function PlayerChip({ index, kicking = false, name, onKick }: PlayerChipProps) {
  return (
    <MotionView enter="zoom" index={index}>
      <View
        className={cn(
          'flex-row items-center gap-xs rounded-full border-hairline border-border-1 bg-bg-1 py-3xs pl-3xs',
          onKick ? 'pr-3xs' : 'pr-sm',
        )}
      >
        <DecorAvatar name={name} size="sm" />
        <Text className="max-w-40 shrink text-label-md text-fg-1" numberOfLines={1}>
          {name}
        </Text>
        {onKick ? (
          <Button
            accessibilityLabel={`Mời ${name} ra`}
            iconLeft="cancel"
            iconOnly
            loading={kicking}
            size="xs"
            variant="danger-secondary"
            onPress={onKick}
          />
        ) : null}
      </View>
    </MotionView>
  );
}
