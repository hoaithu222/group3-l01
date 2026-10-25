import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { showToast } from '@/shared/utils/toast.utils';

import type { RoadmapSubjectDetailDto } from '../../api/roadmap.types';
import {
  ROADMAP_WEEKDAYS,
  subjectIcon,
  toneFromColorName,
} from '../../constants/roadmap.constants';
import { roadmapErrorMessage } from '../../constants/roadmap-error-codes.constants';
import { useRescheduleEnrollment } from '../../queries/roadmap.queries';
import type { SubjectInsights } from '../../types/roadmap-insights.types';
import { lessonCode } from '../../utils/lesson-title';
import { MetaTag } from '../common/MetaTag';
import { SubjectCover } from '../common/SubjectCover';
import { SubjectProgressCard } from './SubjectProgressCard';

export interface SubjectHeaderProps {
  insights: SubjectInsights;
  subject: RoadmapSubjectDetailDto;
  onContinue: () => void;
  onEnroll: () => void;
}

/** Nhãn nút chính nói ĐÚNG việc sắp làm — "Tiếp tục Buổi 5" (đang học dở) khác "Học tiếp Buổi 6" (buổi mới). */
function continueLabel(subject: RoadmapSubjectDetailDto, insights: SubjectInsights): string {
  if (insights.finished) return 'Ôn lại từ đầu';
  const next = insights.nextLesson;
  if (!next) return 'Học tiếp';
  const code = lessonCode(subject.lessonLabel, next.number);
  return insights.resume ? `Tiếp tục ${code}` : `Học tiếp ${code}`;
}

/**
 * Đầu màn tổng quan môn (app.md §3, §7.1 "một hành động chính mỗi màn"):
 *  · ĐÃ đăng ký → `SubjectProgressCard` (vòng %, trễ lịch, dự kiến xong, buổi kế) + nút "Học tiếp Buổi N".
 *  · CHƯA đăng ký → thẻ giới thiệu: ảnh bìa (nếu có) · ô icon màu môn + thời lượng/số buổi · mô tả · lịch gợi ý + "Bắt đầu lộ trình".
 * `requiredDone`/`requiredLessonCount` — không tự đếm lại từ `progress`/`lessons` (BE giữ hai số đó CHUẨN, đã tính
 * `optional`/xuất bản trong `services/progress.service.ts`, xem be.md §5.4).
 */
export function SubjectHeader({ insights, onContinue, onEnroll, subject }: SubjectHeaderProps) {
  const enrolled = Boolean(subject.myEnrollment);
  const unit = subject.lessonLabel.toLowerCase();
  const suggestedDays = ROADMAP_WEEKDAYS.filter((day) =>
    subject.defaultStudyDays.includes(day.value),
  )
    .map((day) => day.short)
    .join(' · ');
  // `enrollmentId` rỗng khi CHƯA đăng ký — vô hại: nút "Dời lịch" (trong `SubjectProgressCard`) chỉ render khi
  // `behind > 0`, mà `computeSubjectInsights` chỉ tính `behind` khi CÓ enrollment (xem `roadmap-progress.ts`).
  const reschedule = useRescheduleEnrollment(subject.myEnrollment?.id ?? '', subject.id);

  const handleReschedule = () => {
    reschedule.mutate(undefined, {
      onError: (error) => showToast('error', roadmapErrorMessage(error)),
      onSuccess: () => showToast('success', 'Đã dời lịch lộ trình theo tiến độ hiện tại'),
    });
  };

  return (
    <View className="gap-md px-md pb-xs pt-xs">
      {enrolled ? (
        <SubjectProgressCard
          insights={insights}
          rescheduling={reschedule.isPending}
          subject={subject}
          onReschedule={handleReschedule}
        />
      ) : (
        // ✅ CHƯA đăng ký = lúc người học đang CÂN NHẮC: ảnh bìa + ô icon theo màu môn (cùng cặp icon/tông với thẻ môn ở tab
        // "Lộ trình") + quy mô lộ trình, thay cho đoạn chữ trần trên nền màn. ⚠️ Ảnh bìa chỉ ở nhánh này: đã học rồi thì thẻ
        // tiến độ + nút "Học tiếp" phải nằm trong tầm mắt, ảnh 343×163 sẽ đẩy đường thời gian các buổi xuống dưới mép màn.
        <View className="overflow-hidden rounded-md bg-bg-1">
          {subject.coverAssetId ? <SubjectCover assetId={subject.coverAssetId} /> : null}
          <View className="gap-sm p-md">
            <View className="flex-row items-center gap-sm">
              <IconTile
                name={subjectIcon(subject)}
                size="lg"
                tone={toneFromColorName(subject.color) ?? 'brand'}
              />
              <View className="flex-1 gap-3xs">
                <Text className="text-label-lg font-semibold text-fg-1">
                  {`Lộ trình ${String(subject.phaseCount)} tháng`}
                </Text>
                <Text className="text-caption-lg text-fg-2">
                  {`${String(subject.lessonCount)} ${unit} · ${String(subject.requiredLessonCount)} bắt buộc`}
                </Text>
              </View>
            </View>
            {subject.description ? (
              <Text className="text-body-md text-fg-2">{subject.description}</Text>
            ) : null}
            {suggestedDays ? <MetaTag icon="clock" label={`Gợi ý học ${suggestedDays}`} /> : null}
          </View>
        </View>
      )}
      <Button
        fullWidth
        iconRight={enrolled ? 'arrow-right' : undefined}
        label={enrolled ? continueLabel(subject, insights) : 'Bắt đầu lộ trình'}
        onPress={enrolled ? onContinue : onEnroll}
      />
    </View>
  );
}
