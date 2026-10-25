import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { ProgressRing } from '@/shared/ui/progress-ring';

import type { RoadmapSubjectDetailDto } from '../../api/roadmap.types';
import { ROADMAP_WEEKDAYS } from '../../constants/roadmap.constants';
import type { SubjectInsights } from '../../types/roadmap-insights.types';
import { lessonCode, lessonDisplayTitle } from '../../utils/lesson-title';
import { formatPlanDay } from '../../utils/roadmap-dates';
import { MetaTag } from '../common/MetaTag';

export interface SubjectProgressCardProps {
  insights: SubjectInsights;
  /** Đang gửi `POST reschedule` — khoá nút "Dời lịch" để bấm hai lần không bắn hai lượt (mobile-ux.md). */
  rescheduling?: boolean;
  subject: RoadmapSubjectDetailDto;
  /** Có mới hiện nút "Dời lịch" cạnh nhãn "Trễ N buổi" (bước 12, P1) — thiếu thì ẩn nút, không đổi phần còn lại. */
  onReschedule?: () => void;
}

/**
 * Tóm tắt tiến độ của môn ĐÃ đăng ký (app.md §3 "% bắt buộc"): vòng % · "12/49 buổi bắt buộc" · trạng thái lịch (trễ N
 * buổi / đúng tiến độ / tạm dừng / đã xong) · ngày dự kiến xong · lịch học trong tuần · buổi kế tiếp.
 *
 * ✅ Thay cho dòng "Đã hoàn thành 0% buổi bắt buộc" + thanh mảnh trước đây: người học nhìn một lần biết mình đang ở đâu,
 * có đang trễ không và buổi nào cần học — mà không phải cuộn xuống danh sách để tự dò.
 */
export function SubjectProgressCard({
  insights,
  onReschedule,
  rescheduling = false,
  subject,
}: SubjectProgressCardProps) {
  const enrollment = subject.myEnrollment;
  const unit = subject.lessonLabel.toLowerCase();
  const { behind, finished, finishDay, nextLesson, percent, today } = insights;
  const paused = enrollment?.status === 'PAUSED';
  const studyDays = ROADMAP_WEEKDAYS.filter((day) => enrollment?.studyDays.includes(day.value))
    .map((day) => day.short)
    .join(' · ');
  const nextDay = nextLesson ? (insights.lessons[nextLesson.id]?.day ?? null) : null;
  const nextHeading = [
    insights.resume ? 'Đang học dở' : 'Tiếp theo',
    nextLesson ? lessonCode(subject.lessonLabel, nextLesson.number) : null,
    nextDay === null ? null : formatPlanDay(nextDay, today),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-md rounded-md bg-bg-1 p-md">
      <View className="flex-row items-center gap-md">
        <ProgressRing
          label={`Đã hoàn thành ${String(percent)} phần trăm ${unit} bắt buộc`}
          progress={percent / 100}
          size={64}
          strokeWidth={6}
          tone={finished ? 'success' : 'brand'}
        >
          <Text className="text-label-md font-semibold text-fg-1">{`${String(percent)}%`}</Text>
        </ProgressRing>
        <View className="flex-1 gap-2xs">
          <Text className="text-label-lg font-semibold text-fg-1">
            {`${String(insights.requiredDone)}/${String(insights.requiredTotal)} ${unit} bắt buộc`}
          </Text>
          {finished ? (
            <MetaTag icon="checkmark-circle" label="Đã hoàn thành lộ trình" tone="success" />
          ) : paused ? (
            <MetaTag icon="pause" label="Đang tạm dừng" />
          ) : behind > 0 ? (
            <View className="flex-row flex-wrap items-center gap-xs">
              <MetaTag
                icon="alert-warning"
                label={`Trễ ${String(behind)} ${unit} so với lịch`}
                tone="warning"
              />
              {onReschedule ? (
                <Button
                  iconLeft="calendar"
                  label="Dời lịch"
                  loading={rescheduling}
                  size="xs"
                  variant="tertiary"
                  onPress={onReschedule}
                />
              ) : null}
            </View>
          ) : (
            <MetaTag icon="checkmark-circle" label="Đúng tiến độ" tone="success" />
          )}
          {finishDay !== null && !finished ? (
            <MetaTag
              icon="calendar"
              label={`Dự kiến xong ${formatPlanDay(finishDay, today, { relative: false })}`}
            />
          ) : null}
          {studyDays ? <MetaTag icon="clock" label={`Lịch học ${studyDays}`} /> : null}
        </View>
      </View>

      {nextLesson && !finished ? (
        <View className="gap-3xs border-t border-divider-1 pt-sm">
          <Text className="text-caption-lg text-fg-2">{nextHeading}</Text>
          <Text className="text-label-md font-semibold text-fg-1" numberOfLines={2}>
            {lessonDisplayTitle(nextLesson.title, subject.lessonLabel, nextLesson.number)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
