import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { paceLabel } from '../../utils/mock-setup-utils';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-3xs rounded-sm bg-surface-info px-xs py-sm">
      <Text className="text-header-lg font-bold text-fg-1" maxFontSizeMultiplier={1.3}>
        {value}
      </Text>
      <Text className="text-center text-label-sm text-fg-2" maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}

export interface SetupSummaryProps {
  /** Số câu THỰC SỰ vào đề = min(số chọn, số câu có sẵn). */
  count: number;
  minutes: number;
  /** Giây trung bình cho một câu; `null` khi đề không có câu nào. */
  pace: number | null;
  /** Số câu chấm được đang thoả bộ lọc chủ đề; `null` = chưa biết (đang tải / không tải được). */
  pool: number | null;
  /** Số câu người dùng chọn — lớn hơn `pool` thì có dòng giải thích vì sao đề ngắn hơn. */
  requested: number;
  setTitle: string;
  shuffle: boolean;
  topicCount: number;
}

/**
 * "Đề của bạn": tên bộ + tóm tắt CẬP NHẬT NGAY khi đổi cấu hình — số câu · thời lượng · thời gian trung bình mỗi câu — và
 * dòng phụ (trộn câu, số chủ đề, hoặc lý do đề có ít câu hơn đã chọn). Bản sắc chế độ Thi thử (`STUDY_MODE_META.mock`).
 */
export function SetupSummary({
  count,
  minutes,
  pace,
  pool,
  requested,
  setTitle,
  shuffle,
  topicCount,
}: SetupSummaryProps) {
  const meta = STUDY_MODE_META.mock;
  const perQuestion = pace === null ? null : paceLabel(pace);
  const short = pool !== null && pool > 0 && requested > pool;
  return (
    <Card>
      <View className="flex-row items-center gap-sm">
        <IconTile name={meta.icon} size="lg" tone={meta.tone} />
        <Text className="flex-1 text-header-md text-fg-1" numberOfLines={2}>
          {setTitle}
        </Text>
      </View>
      <Text className="text-body-md text-fg-2">
        Chỉ câu chấm được (trắc nghiệm, Đúng/Sai, điền) vào đề. Thẻ ghi nhớ không tính.
      </Text>
      <View
        accessibilityLabel={`Đề của bạn: ${count} câu, ${minutes} phút`}
        accessible
        className="flex-row gap-xs"
      >
        <Stat label="câu trong đề" value={String(count)} />
        <Stat label="phút làm bài" value={String(minutes)} />
        <Stat label={perQuestion?.unit ?? 'giây / câu'} value={perQuestion?.value ?? '—'} />
      </View>
      <Text className="text-label-md text-fg-2">
        {`${shuffle ? 'Trộn câu hỏi và đáp án' : 'Giữ thứ tự gốc'}${topicCount > 0 ? ` · ${topicCount} chủ đề` : ''}`}
      </Text>
      {short ? (
        <View className="flex-row items-center gap-xs">
          <Icon color="info" name="alert-information" size={16} />
          <Text className="flex-1 text-label-md text-fg-1">
            {`Chỉ có ${pool} câu chấm được nên đề có ${pool} câu.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
