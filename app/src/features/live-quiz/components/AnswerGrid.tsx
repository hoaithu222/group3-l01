import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';

import type { QuizOptionDto } from '../api/live-quiz.types';
import { answerColumns, chunkRows } from '../utils/answer-identity';
import { AnswerTile } from './AnswerTile';
import { MotionView } from './MotionView';

export interface AnswerGridProps {
  options: QuizOptionDto[];
  /** Khoá cả bảng (hết giờ / đã chọn): ô không phải ô đã chọn thì mờ và không bấm được. */
  locked?: boolean;
  /** Chỉ số ô đang chờ server xác nhận (icon đồng hồ). */
  loadingIndex?: number | null;
  selected?: number | null;
  /** Không truyền ⇒ bảng CHỈ ĐỂ XEM (màn của chủ phòng). */
  onChoose?: (choice: number) => void;
}

/**
 * Lưới ô đáp án. Điện thoại 2×2; đáp án dài ⇒ một cột; máy tính bảng rộng + đáp án ngắn ⇒ một hàng (`answerColumns` quyết theo
 * NỘI DUNG chứ không theo bề rộng cứng). Ô lẻ ở hàng cuối được kéo giãn cho đủ hàng. Ô hiện lần lượt (nảy nhẹ) mỗi khi câu mới
 * mở — `QuestionStage` đặt `key` theo chỉ số câu nên lưới dựng lại đúng lúc đó; "Giảm chuyển động" ⇒ hiện ngay.
 */
export function AnswerGrid({
  loadingIndex = null,
  locked = false,
  onChoose,
  options,
  selected = null,
}: AnswerGridProps) {
  const { tier } = useBreakpoint();
  const columns = answerColumns(
    options.map((option) => option.text),
    tier === 'tablet-lg',
  );
  const rows = chunkRows(
    options.map((option, index) => ({ index, option })),
    columns,
  );

  return (
    <View className="gap-sm">
      {rows.map((row) => (
        <View key={row[0]?.index} className="flex-row gap-sm">
          {row.map(({ index, option }) => (
            <MotionView
              key={`${String(index)}-${option.text}`}
              className="flex-1"
              enter="zoom"
              index={index}
            >
              <AnswerTile
                dimmed={locked && selected !== index}
                disabled={locked && selected !== index}
                index={index}
                loading={loadingIndex === index}
                row={columns === 1}
                selected={selected === index}
                text={option.text}
                onPress={onChoose ? () => (locked ? undefined : onChoose(index)) : undefined}
              />
            </MotionView>
          ))}
        </View>
      ))}
    </View>
  );
}
