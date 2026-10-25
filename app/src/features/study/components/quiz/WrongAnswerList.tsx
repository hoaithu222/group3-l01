import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { Section } from '@/shared/ui/section';

import { WRONG_PREVIEW_MAX, type WrongRow } from '../../utils/quick-quiz-result';

/**
 * Các câu SAI của lượt, rút gọn: đề (tối đa 2 dòng) + "Đáp án: …". Chỉ liệt kê vài câu đầu (`WRONG_PREVIEW_MAX`) — danh sách dài sẽ đẩy nút hành động ra khỏi
 * màn; phần còn lại nói bằng "và N câu khác" (nút "Luyện lại" làm hết). Không có câu sai thì không vẽ gì. Tiêu đề nhóm nằm NGOÀI thẻ (`Section`).
 */
export function WrongAnswerList({ rows, total }: { rows: readonly WrongRow[]; total: number }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, WRONG_PREVIEW_MAX);
  const hidden = total - shown.length;

  return (
    <Section title={`Câu cần ôn (${total})`}>
      <Card className="gap-sm">
        {shown.map((row, index) => (
          <View key={row.id} className="gap-sm">
            {index > 0 ? <Divider /> : null}
            <View className="gap-3xs">
              <Text className="text-label-lg text-fg-1" numberOfLines={2}>
                {row.prompt}
              </Text>
              <Text className="text-body-md text-fg-2" numberOfLines={2}>
                {`Đáp án: ${row.answer}`}
              </Text>
            </View>
          </View>
        ))}
        {hidden > 0 ? (
          <Text className="text-caption-lg text-fg-2">{`và ${hidden} câu khác`}</Text>
        ) : null}
      </Card>
    </Section>
  );
}
