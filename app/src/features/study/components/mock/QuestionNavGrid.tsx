import { View } from 'react-native';

import { Card } from '@/shared/ui/card';

import type { MockQuestionPublic } from '../../api/mock-attempts.types';
import { navSummary } from '../../utils/mock-nav-utils';
import { NavCell } from './NavCell';
import { NavLegend } from './NavLegend';

export interface QuestionNavGridProps {
  answered: ReadonlySet<string>;
  current: number;
  /** Câu đánh dấu "xem lại" — ngôi sao ở góc trái ô, kèm nhãn trợ năng (không chỉ màu). */
  flagged?: ReadonlySet<string>;
  onSelect: (index: number) => void;
  /** Câu còn CHƯA lên server (mất mạng/đang gửi) — chấm "Chưa đồng bộ" ở góc phải ô. */
  pending?: ReadonlySet<string>;
  questions: MockQuestionPublic[];
}

/**
 * Lưới nhảy câu (app.md p4-02 §2, §7): đã trả lời / bỏ trống / đang xem / đánh dấu xem lại / chưa đồng bộ — mỗi trạng thái
 * một dấu hiệu HÌNH khác nhau (nền, nét viền, ngôi sao, chấm; xem `NavCell`) + chú giải bằng chữ (`NavLegend`). Nhãn trợ năng
 * của ô đọc đủ ("Câu 7, đã trả lời, đánh dấu xem lại, chưa đồng bộ"); ô đang xem là `selected`.
 */
export function QuestionNavGrid({
  answered,
  current,
  flagged,
  onSelect,
  pending,
  questions,
}: QuestionNavGridProps) {
  return (
    <Card title="Danh sách câu">
      <View accessibilityLabel="Danh sách câu hỏi" className="flex-row flex-wrap gap-xs">
        {questions.map((q, i) => (
          <NavCell
            key={q.itemId}
            current={i === current}
            done={answered.has(q.itemId)}
            flagged={flagged?.has(q.itemId) === true}
            number={i + 1}
            pending={pending?.has(q.itemId) === true}
            onPress={() => onSelect(i)}
          />
        ))}
      </View>
      <NavLegend summary={navSummary(questions, answered, flagged, pending)} />
    </Card>
  );
}
