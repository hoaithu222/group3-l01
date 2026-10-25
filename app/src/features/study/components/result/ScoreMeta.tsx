import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';

import type { MockAttemptDto } from '../../api/mock-attempts.types';
import { attemptDurationMs, formatDurationVi } from '../../utils/mock-result-utils';

function MetaLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View className="flex-row items-center gap-xs">
      <Icon color="fg-2" name={icon} size={16} />
      <Text className="flex-1 text-label-md text-fg-2">{text}</Text>
    </View>
  );
}

/**
 * Ba dòng phụ dưới điểm: thời gian làm, "Tự nộp khi hết giờ", số lần rời ứng dụng (README §2: chỉ ghi nhận, không trừ
 * điểm). Dòng nào không có dữ liệu thì bỏ; không dòng nào thì không vẽ gì.
 */
export function ScoreMeta({ attempt }: { attempt: MockAttemptDto }) {
  const used = attemptDurationMs(attempt);
  const away = attempt.backgroundCount > 0;
  if (used === null && attempt.submitMode !== 'AUTO' && !away) return null;
  return (
    <View className="w-full gap-xs">
      {used === null ? null : (
        <MetaLine icon="clock" text={`Làm trong ${formatDurationVi(used)}`} />
      )}
      {attempt.submitMode === 'AUTO' ? <MetaLine icon="timer" text="Tự nộp khi hết giờ" /> : null}
      {away ? (
        <MetaLine
          icon="alert-information"
          text={`Rời ứng dụng ${attempt.backgroundCount} lần (${formatDurationVi(attempt.backgroundMs)})`}
        />
      ) : null}
    </View>
  );
}
