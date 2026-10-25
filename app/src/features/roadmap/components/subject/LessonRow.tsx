import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { RoadmapLessonSummaryDto, RoadmapProgressStatus } from '../../api/roadmap.types';
import { PROGRESS_STATUS_META } from '../../constants/roadmap.constants';
import type { LessonInsight } from '../../types/roadmap-insights.types';
import { lessonCode, lessonDisplayTitle } from '../../utils/lesson-title';
import { formatPlanDay, formatStudyMinutes } from '../../utils/roadmap-dates';
import { MetaTag } from '../common/MetaTag';
import { LessonNode } from './LessonNode';

export interface LessonRowProps {
  /** Chưa đăng ký ⇒ buổi đầu ghi "Bắt đầu từ đây" thay vì "Học tiếp" (chưa có gì để "tiếp"). */
  enrolled: boolean;
  insight: LessonInsight | undefined;
  /** Dòng cuối của tháng (không còn dự án cuối tháng phía sau) ⇒ không vẽ đoạn nối xuống. */
  isLast: boolean;
  lesson: RoadmapLessonSummaryDto;
  /** `Subject.lessonLabel` ("Buổi" | "Ngày" | "Bài") — app.md §7.7. */
  lessonLabel: string;
  status: RoadmapProgressStatus | undefined;
  today: number | null;
  onPress: () => void;
}

/**
 * Một buổi trên ĐƯỜNG THỜI GIAN của tháng (app.md §3): nút trạng thái + đoạn nối bên trái, thẻ bên phải gồm mã buổi ·
 * ngày dự kiến ("Hôm nay", "T5, 09/10"), tiêu đề (đã bỏ tiền tố "Buổi 01:" lặp), và các mẩu: thời lượng, số hình, Tuỳ
 * chọn, Trễ lịch, Học tiếp. Buổi KẾ TIẾP nổi bật bằng nền + viền thương hiệu.
 *
 * ⛔ Không dùng `ListItem` như bản trước: `ListItem` chia đôi hàng cho nhãn/giá trị (cả hai `flex-1`) ⇒ ngày dự kiến
 * chiếm nửa phải, tiêu đề bị ép xuống 5 dòng ở nửa trái (ảnh chụp thật).
 */
export function LessonRow({ enrolled, insight, isLast, lesson, lessonLabel, onPress, status, today }: LessonRowProps) {
  const state = insight?.state ?? 'upcoming';
  const locked = state === 'locked';
  const highlight = state === 'next' || state === 'in-progress';
  const code = lessonCode(lessonLabel, lesson.number);
  const title = lessonDisplayTitle(lesson.title, lessonLabel, lesson.number);
  const when = insight?.day != null ? formatPlanDay(insight.day, today) : null;
  const statusLabel = locked ? 'Chưa mở' : PROGRESS_STATUS_META[status ?? 'NOT_STARTED'].label;

  const spoken = [
    `${code}: ${title}`,
    statusLabel,
    when ? `dự kiến ${when}` : null,
    lesson.optional ? 'tuỳ chọn' : null,
    insight?.overdue ? 'trễ lịch' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint={locked ? 'Hoàn thành buổi trước để mở' : undefined}
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      className="flex-row gap-sm"
      onPress={onPress}
    >
      {({ pressed }) => (
        <>
          <View className="w-8 items-center">
            <LessonNode number={lesson.number} state={state} />
            {isLast ? null : <View className="w-0.5 flex-1 bg-border-1" />}
          </View>
          <View className="flex-1 pb-sm">
            <View
              className={cn(
                'gap-2xs rounded-md border p-sm',
                highlight ? 'border-border-brand bg-surface-primary' : 'border-border-1 bg-bg-1',
                pressed && 'bg-bg-3',
              )}
            >
              <View className="flex-row items-center gap-xs">
                <Text className="flex-1 text-caption-lg text-fg-2" numberOfLines={1}>
                  {when ? `${code} · ${when}` : code}
                </Text>
                <Icon color="fg-2" name="arrow-right-small" size="sm" />
              </View>
              <Text className={cn('text-label-md font-semibold', locked ? 'text-fg-2' : 'text-fg-1')} numberOfLines={3}>
                {title}
              </Text>
              <View className="flex-row flex-wrap gap-x-sm gap-y-2xs">
                {state === 'next' ? (
                  <MetaTag icon="arrow-right" label={enrolled ? 'Học tiếp' : 'Bắt đầu từ đây'} tone="brand" />
                ) : null}
                {state === 'in-progress' ? <MetaTag icon="clock" label="Đang học dở" tone="warning" /> : null}
                {state === 'done' ? <MetaTag icon="checkmark-circle" label="Đã xong" tone="success" /> : null}
                {locked ? <MetaTag icon="lock" label="Chưa mở" /> : null}
                {insight?.overdue ? <MetaTag icon="alert-warning" label="Trễ lịch" tone="warning" /> : null}
                {lesson.durationMinutes ? <MetaTag icon="timer" label={formatStudyMinutes(lesson.durationMinutes)} /> : null}
                {lesson.mediaCount > 0 ? <MetaTag icon="image" label={`${String(lesson.mediaCount)} hình`} /> : null}
                {lesson.optional ? <MetaTag icon="star" label="Tuỳ chọn" tone="info" /> : null}
              </View>
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}
