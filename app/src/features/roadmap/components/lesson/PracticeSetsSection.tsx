import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';

import type { RoadmapPracticeSetSummaryDto } from '../../api/roadmap.types';
import {
  roadmapPracticeFlashcardsHref,
  roadmapPracticeQuizHref,
  roadmapPracticeSetHref,
  roadmapPracticeSrHref,
} from '../../utils/roadmap-routes';

export interface PracticeSetsSectionProps {
  practiceSets: readonly RoadmapPracticeSetSummaryDto[];
}

/**
 * Một bộ luyện tập gắn với buổi học (be.md §4 `LessonDto.practiceSets[]`) — chạm tiêu đề (hay bất kỳ chỗ trống nào
 * của thẻ) mở màn tổng quan bộ có sẵn ĐỦ Học thẻ/Quiz/Ôn SR/Thi thử; hai nút tắt "Học thẻ"/"Ôn theo lịch" đi THẲNG
 * chế độ hay dùng nhất mà không phải qua màn trung gian, "Quiz nhanh" chỉ hiện khi `hasQuiz` (bộ có câu chấm được —
 * cùng điều kiện `SetStudyActions` bên `study`, chỉ đọc lại field DTO chứ không import kiểu của feature đó).
 *
 * ⚠️ `title` là CHUỖI + `Card` có `onPress` ⇒ `Card` tự chuyển vai trợ năng sang `splitAction` (xem `Card.tsx`):
 * tiêu đề mang vai "nút" mở tổng quan, còn các nút trong `footer` VẪN bấm được độc lập — đây đúng là ca `Card` được
 * thiết kế để chứa nút lồng bên trong một thẻ bấm được.
 */
function PracticeSetCard({ set }: { set: RoadmapPracticeSetSummaryDto }) {
  return (
    <Card
      footer={
        <View className="flex-row flex-wrap gap-sm">
          <Button
            iconLeft="copy"
            label="Học thẻ"
            size="sm"
            onPress={() => router.push(roadmapPracticeFlashcardsHref(set.id))}
          />
          <Button
            iconLeft="calendar-favorite"
            label="Ôn theo lịch"
            size="sm"
            variant="secondary"
            onPress={() => router.push(roadmapPracticeSrHref(set.id))}
          />
          {set.hasQuiz ? (
            <Button
              iconLeft="play"
              label="Quiz nhanh"
              size="sm"
              variant="secondary"
              onPress={() => router.push(roadmapPracticeQuizHref(set.id))}
            />
          ) : null}
        </View>
      }
      title={set.title}
      onPress={() => router.push(roadmapPracticeSetHref(set.id))}
    >
      {/* Ô icon `book` tông `success` = bản sắc phân hệ Học (cùng cặp với lối vào "Học" ở Trang chủ) — nhìn là biết đây là
          một BỘ HỌC, khác các hàng tài liệu bên dưới. Trang trí: số thẻ đã là chữ. */}
      <View className="flex-row items-center gap-xs">
        <IconTile name="book" size="sm" tone="success" />
        <Text className="flex-1 text-caption-lg text-fg-2">{`${String(set.itemCount)} thẻ`}</Text>
      </View>
    </Card>
  );
}

/**
 * Khối "Luyện tập" (p4-07 bước 12, P1) — đứng ĐẦU tab Tài liệu vì đây là nơi liệt kê mọi tài nguyên NGOÀI nội dung
 * chính của buổi; bộ thẻ/quiz gắn với buổi cũng là một loại tài nguyên như vậy. Ẩn hẳn khi buổi không gắn bộ nào.
 */
export function PracticeSetsSection({ practiceSets }: PracticeSetsSectionProps) {
  if (practiceSets.length === 0) return null;
  return (
    <Section title="Luyện tập">
      <View className="gap-sm">
        {practiceSets.map((set) => (
          <PracticeSetCard key={set.id} set={set} />
        ))}
      </View>
    </Section>
  );
}
