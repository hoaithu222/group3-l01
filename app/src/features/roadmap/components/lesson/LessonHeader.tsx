import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';

import type { RoadmapLessonDto, RoadmapProgressStatus } from '../../api/roadmap.types';
import { PROGRESS_STATUS_META } from '../../constants/roadmap.constants';
import { inlineMarkdownToSpans } from '../../utils/inline-markdown';
import { lessonDisplayTitle } from '../../utils/lesson-title';
import { formatStudyMinutes } from '../../utils/roadmap-dates';
import { Spans } from '../blocks/Spans';
import { MetaTag } from '../common/MetaTag';

export interface LessonHeaderProps {
  lesson: RoadmapLessonDto;
  /** Trạng thái đang hiện (state lạc quan của `useLessonProgress`, không phải `lesson.myProgress` cũ). */
  status: RoadmapProgressStatus;
}

/**
 * Thông tin buổi học nằm ĐẦU vùng cuộn của mỗi tab; lề ngang do tab quản lý.
 * ⚠️ Không cắt tiêu đề/yêu cầu trước: người học cần đọc đủ, kể cả khi tăng cỡ chữ hệ thống.
 *
 * ⚠️ Ba `MetaTag` dưới đây KHÔNG icon (⬇ 29/09): icon vốn chỉ trang trí (xem `MetaTag.tsx`) mà lại là thứ đẩy hàng này
 * tràn sang dòng hai trên máy hẹp — bỏ icon vừa gọn vừa hay giữ được MỘT dòng.
 */
export function LessonHeader({ lesson, status }: LessonHeaderProps) {
  const meta = PROGRESS_STATUS_META[status];

  return (
    <View className="gap-2xs">
      {lesson.phaseTitle ? <Text className="text-caption-lg text-fg-2">{lesson.phaseTitle}</Text> : null}
      <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
        {lessonDisplayTitle(lesson.title, lesson.lessonLabel, lesson.number)}
      </Text>
      <View className="flex-row flex-wrap items-center gap-x-sm gap-y-2xs">
        <Badge label={meta.label} size="sm" variant={meta.badge} />
        {lesson.durationMinutes ? <MetaTag label={formatStudyMinutes(lesson.durationMinutes)} /> : null}
        {lesson.mediaCount > 0 ? <MetaTag label={`${String(lesson.mediaCount)} hình minh hoạ`} /> : null}
        {lesson.optional ? <MetaTag label="Tuỳ chọn" tone="info" /> : null}
      </View>
      {lesson.prerequisites ? (
        <Text className="text-caption-lg text-fg-2">
          <Text className="font-semibold">Cần biết trước: </Text>
          <Spans spans={inlineMarkdownToSpans(lesson.prerequisites)} />
        </Text>
      ) : null}
    </View>
  );
}
