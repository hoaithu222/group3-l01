import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ProgressRing } from '@/shared/ui/progress-ring';

import type { ScanResult } from '../api/plagiarism.types';
import {
  fingerprintStatusLabel,
  levelBadgeVariant,
  levelLabel,
  levelRingTone,
} from '../utils/level-label';

interface ResultCardProps {
  onPress: () => void;
  result: ScanResult;
}

/**
 * Tên tệp, điểm %, nhãn mức bằng CHỮ, số đoạn, nguồn trùng nhiều nhất (app.md §2).
 *
 * Điểm vẽ bằng `ProgressRing` (cung = tỉ lệ trùng, số % ở tâm) để mắt so nhanh giữa các thẻ; mức vẫn là `Badge` có CHỮ
 * — ⛔ màu cung không bao giờ là dấu hiệu duy nhất.
 * ⚠️ `Pressable` tự dựng (không `Card onPress`) vì cần `accessibilityLabel` gộp đủ ý: vòng điểm là phần tử `accessible`
 * riêng (vai `progressbar`, đọc "Đang tải…") nên bị ẩn khỏi trình đọc màn hình, con số % đi vào nhãn của cả thẻ.
 */
export function ResultCard({ onPress, result }: ResultCardProps) {
  const topSource = result.matchedSources[0];
  const skipped = result.status === 'SKIPPED';
  const skipText = fingerprintStatusLabel(result.skipReason ?? '') ?? 'Không so sánh được';
  const levelText = result.level ? `Mức ${levelLabel(result.level).toLowerCase()}` : null;
  const sourceText = topSource
    ? `Trùng nhiều nhất với "${topSource.nameSnapshot}" (${topSource.similarity}%)`
    : 'Không thấy đoạn trùng đáng kể';
  const spoken = skipped
    ? `${result.targetName}, ${skipText}`
    : [
        result.targetName,
        `điểm trùng ${result.score}%`,
        levelText,
        `${result.sectionCount} đoạn trùng`,
        sourceText,
      ]
        .filter(Boolean)
        .join(', ');

  return (
    <Pressable
      accessibilityHint="Mở các đoạn trùng của tệp này"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className="flex-row items-center gap-md rounded-md bg-bg-1 p-md active:opacity-80"
      onPress={onPress}
    >
      {skipped ? (
        <IconTile name="alert-information" size="lg" tone="neutral" />
      ) : (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ProgressRing
            progress={result.score / 100}
            size={56}
            strokeWidth={5}
            tone={levelRingTone(result.level)}
          >
            <Text className="text-label-md font-bold text-fg-1">{result.score}%</Text>
          </ProgressRing>
        </View>
      )}
      <View className="flex-1 gap-2xs">
        <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={1}>
          {result.targetName}
        </Text>
        {skipped ? (
          <Text className="text-caption-lg text-fg-2">{skipText}</Text>
        ) : (
          <>
            <View className="flex-row flex-wrap items-center gap-xs">
              {levelText ? (
                <Badge label={levelText} variant={levelBadgeVariant(result.level)} />
              ) : null}
              <Text className="text-caption-lg text-fg-2">{result.sectionCount} đoạn trùng</Text>
            </View>
            <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
              {sourceText}
            </Text>
          </>
        )}
      </View>
      <Icon color="fg-2" name="arrow-right-small" size="sm" />
    </Pressable>
  );
}
