import { router } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { RoadmapLessonNavDto, RoadmapProgressStatus } from '../../api/roadmap.types';
import { lessonCode } from '../../utils/lesson-title';
import { roadmapLessonHref } from '../../utils/roadmap-routes';

export interface LessonFooterProps {
  completing: boolean;
  /** `Subject.lessonLabel` ("Buổi" | "Ngày" | "Bài") — "Hoàn thành buổi", "Học tiếp Ngày 6". */
  lessonLabel: string;
  next: RoadmapLessonNavDto | null;
  prev: RoadmapLessonNavDto | null;
  status: RoadmapProgressStatus;
  subjectId: string;
  onComplete: () => void;
}

/**
 * ← Buổi trước · **hành động chính** · Buổi sau → (app.md §3, §7.1 một hành động chính). Hành động chính đổi theo tiến
 * độ: chưa xong → "Hoàn thành buổi"; đã xong → "Học tiếp Buổi N" (không bắt người học quay ra lộ trình tìm buổi kế);
 * buổi cuối đã xong → "Về lộ trình".
 *
 * ⛔ Nút giữa bọc `<View className="flex-1">` + `fullWidth` (ui-components.md §4.4): bản trước đặt `className="flex-1"`
 * thẳng lên `Button` — lớp đó rơi vào khối BÊN TRONG, còn `fullWidth` cho `Pressable` ngoài `w-full` ⇒ nút giữa rộng
 * 100% hàng và ĐẨY nút "Buổi sau" ra ngoài mép màn.
 *
 * ⚠️ Chuyển buổi bằng `router.replace`, không `push`: `push` chồng thêm một màn buổi học lên ngăn xếp mỗi lần bấm
 * (học 10 buổi ⇒ phải bấm "Quay lại" 10 lần mới về lộ trình) và GIỮ màn cũ sống bên dưới. `replace` gỡ màn cũ ⇒ cleanup
 * của `useLessonProgress` gửi nốt patch đang gom dở của buổi cũ trước khi màn mới gắn vào.
 */
export function LessonFooter({ completing, lessonLabel, next, onComplete, prev, status, subjectId }: LessonFooterProps) {
  const goTo = (lessonId: string) => router.replace(roadmapLessonHref(subjectId, lessonId));
  const unit = lessonLabel.toLowerCase();
  const done = status === 'COMPLETED';

  let primary: { label: string; onPress: () => void };
  if (!done) primary = { label: `Hoàn thành ${unit}`, onPress: onComplete };
  else if (next) primary = { label: `Học tiếp ${lessonCode(lessonLabel, next.number)}`, onPress: () => goTo(next.id) };
  else primary = { label: 'Về lộ trình', onPress: () => router.back() };

  return (
    <BottomActionBar>
      <View className="flex-row items-center gap-xs">
        <Button
          accessibilityLabel={prev ? `${lessonCode(lessonLabel, prev.number)}: ${prev.title}` : `Không có ${unit} trước`}
          disabled={!prev}
          iconLeft="arrow-left"
          iconOnly
          variant="secondary"
          onPress={() => prev && goTo(prev.id)}
        />
        <View className="flex-1">
          <Button
            fullWidth
            iconRight={done && next ? 'arrow-right' : undefined}
            label={primary.label}
            loading={completing}
            onPress={primary.onPress}
          />
        </View>
        <Button
          accessibilityLabel={next ? `${lessonCode(lessonLabel, next.number)}: ${next.title}` : `Không có ${unit} sau`}
          disabled={!next}
          iconLeft="arrow-right"
          iconOnly
          variant="secondary"
          onPress={() => next && goTo(next.id)}
        />
      </View>
    </BottomActionBar>
  );
}
