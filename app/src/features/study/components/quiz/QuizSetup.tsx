import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Chip } from '@/shared/ui/chip';
import { IconTile } from '@/shared/ui/icon-tile';
import { Toggle } from '@/shared/ui/toggle';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import type { QuizConfig, QuizCount } from '../../utils/quick-quiz-items';
import { EnterView } from '../visual/EnterView';

export interface QuizSetupProps {
  choices: readonly QuizCount[];
  config: QuizConfig;
  /** Số câu chấm được của bộ. */
  total: number;
  onCount: (count: QuizCount) => void;
  onShuffle: (shuffle: boolean) => void;
}

const countLabel = (count: QuizCount, total: number): string =>
  count === 'all' ? `Tất cả (${total})` : `${count} câu`;

/**
 * Khối thiết lập ĐẦU màn (không phải màn riêng): giới thiệu chế độ, chọn số câu (chip 10 · 20 · Tất cả), bật/tắt "Trộn câu" (mặc định bật). Nút "Bắt đầu"
 * nằm ở thanh đáy dính do `QuickQuizSession` dựng — nổi bật và luôn với tới được. Bộ ngắn (mọi mốc ≥ tổng) chỉ còn "Tất cả" nên hàng chọn ẩn đi, thay bằng
 * một dòng "Bộ có N câu" — không bắt người học chọn giữa một lựa chọn.
 *
 * Nói RÕ đây là luyện tập trên máy: điểm/chuỗi không lưu, không cộng XP — đừng để người học tưởng kết quả được ghi nhận.
 */
export function QuizSetup({ choices, config, onCount, onShuffle, total }: QuizSetupProps) {
  const meta = STUDY_MODE_META.quick;

  return (
    <EnterView className="gap-md py-xs">
      <Card className="gap-md">
        <View className="flex-row items-center gap-sm">
          <IconTile name={meta.icon} size="lg" tone={meta.tone} />
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-header-sm text-fg-1">
              {meta.label}
            </Text>
            <Text className="text-body-md text-fg-2">{meta.description}</Text>
          </View>
        </View>
        <View className="gap-xs">
          <Text className="text-label-lg text-fg-1">Số câu</Text>
          {choices.length > 1 ? (
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-xs">
              {choices.map((count) => (
                <Chip
                  key={count}
                  label={countLabel(count, total)}
                  role="radio"
                  selected={config.count === count}
                  onPress={() => onCount(count)}
                />
              ))}
            </View>
          ) : (
            <Text className="text-body-md text-fg-2">{`Bộ có ${total} câu chấm được — làm tất cả.`}</Text>
          )}
        </View>
        <Toggle
          description="Đổi thứ tự câu mỗi lượt"
          label="Trộn câu"
          value={config.shuffle}
          onChange={onShuffle}
        />
      </Card>
      <Text className="text-center text-caption-lg text-fg-2">
        Luyện tập ngay trên máy: kết quả không được lưu và không cộng điểm/XP.
      </Text>
    </EnterView>
  );
}
