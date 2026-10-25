import { Pressable, Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { twMergeConfig } from '@/shared/utils/style/cn';

import type { RoadmapSubjectCardDto, RoadmapTodayItemDto } from '../../api/roadmap.types';
import { subjectIcon, toneFromColorName } from '../../constants/roadmap.constants';
import { lessonCode, lessonDisplayTitle } from '../../utils/lesson-title';
import { dateKeyToDay, formatPlanDay } from '../../utils/roadmap-dates';
import { MetaTag } from '../common/MetaTag';
import { ProgressBar } from '../common/ProgressBar';
import { SubjectCover } from '../common/SubjectCover';

export interface SubjectCardProps {
  /** Buổi kế tiếp của môn (`GET /roadmap/today`, một phần tử mỗi đăng ký ACTIVE) — không có khi chưa học/tạm dừng. */
  next?: RoadmapTodayItemDto;
  subject: RoadmapSubjectCardDto;
  /** "Hôm nay" (day number, `todayDay`) cho nhãn "Hôm nay/Ngày mai". */
  today: number | null;
  onOpen: (subject: RoadmapSubjectCardDto) => void;
}

const card = tv(
  {
    // Lề ngang ở `Pressable` (vùng chạm gồm cả lề), nền/bo góc ở `View` con để `pressed` đổi được nền — khuôn `StudySetCard`.
    slots: { pressable: 'px-md', root: 'gap-sm rounded-md p-md' },
    variants: { pressed: { false: { root: 'bg-bg-1' }, true: { root: 'bg-bg-3' } } },
    defaultVariants: { pressed: false },
  },
  { twMergeConfig },
);

/**
 * Thẻ môn ở tab "Lộ trình" (app.md §3): icon + tông theo môn, "N tháng · N buổi", thanh % của tôi kèm trạng thái lịch
 * (trễ / đã xong), khối "Tiếp theo" (buổi kế + ngày dự kiến) và lời gọi hành động. Chưa đăng ký thì thay khối tiến độ
 * bằng 2 dòng mô tả — thứ người ta cần để quyết định có bắt đầu hay không.
 *
 * ⛔ MỘT `Pressable accessible` cho cả thẻ (khuôn `StudySetCard`), không lồng nút thứ hai: mọi thông tin gộp vào
 * `accessibilityLabel` thành một câu, các mẩu bên trong là trang trí.
 */
export function SubjectCard({ next, onOpen, subject, today }: SubjectCardProps) {
  const enrollment = subject.myEnrollment;
  const unit = subject.lessonLabel.toLowerCase();
  const finished = Boolean(enrollment && enrollment.percent >= 100);
  const behind = next?.behind ?? enrollment?.behind ?? 0;
  const nextDay = next ? dateKeyToDay(next.plannedDate) : null;
  const nextWhen = nextDay === null ? null : formatPlanDay(nextDay, today);
  const nextCode = next ? lessonCode(subject.lessonLabel, next.lesson.number) : '';
  const nextTitle = next
    ? lessonDisplayTitle(next.lesson.title, subject.lessonLabel, next.lesson.number)
    : '';
  const actionLabel = !enrollment ? 'Bắt đầu' : finished ? 'Ôn lại' : 'Học tiếp';

  const spoken = [
    subject.title,
    `${String(subject.phaseCount)} tháng, ${String(subject.lessonCount)} ${unit}`,
    enrollment ? `đã hoàn thành ${String(enrollment.percent)} phần trăm` : 'chưa bắt đầu',
    behind > 0 ? `trễ ${String(behind)} ${unit}` : null,
    next ? `tiếp theo ${nextCode}: ${nextTitle}${nextWhen ? `, ${nextWhen}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint={`${actionLabel} lộ trình`}
      accessibilityLabel={spoken}
      accessibilityRole="button"
      className={card().pressable()}
      onPress={() => onOpen(subject)}
    >
      {({ pressed }) => (
        <View className={card({ pressed }).root()}>
          {subject.coverAssetId ? <SubjectCover assetId={subject.coverAssetId} /> : null}
          <View className="flex-row items-center gap-sm">
            <IconTile
              name={subjectIcon(subject)}
              tone={toneFromColorName(subject.color) ?? 'brand'}
            />
            <View className="flex-1 gap-3xs">
              <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
                {subject.title}
              </Text>
              <Text className="text-caption-lg text-fg-2">
                {`${String(subject.phaseCount)} tháng · ${String(subject.lessonCount)} ${unit}`}
              </Text>
            </View>
          </View>

          {enrollment ? (
            <View className="gap-xs">
              <View className="flex-row flex-wrap items-center justify-between gap-xs">
                <Text className="text-caption-lg text-fg-2">{`Đã hoàn thành ${String(enrollment.percent)}%`}</Text>
                {behind > 0 ? (
                  <MetaTag
                    icon="alert-warning"
                    label={`Trễ ${String(behind)} ${unit}`}
                    tone="warning"
                  />
                ) : finished ? (
                  <MetaTag icon="checkmark-circle" label="Đã hoàn thành" tone="success" />
                ) : null}
              </View>
              <ProgressBar percent={enrollment.percent} tone={finished ? 'success' : 'brand'} />
            </View>
          ) : subject.description ? (
            <Text className="text-body-md text-fg-2" numberOfLines={2}>
              {subject.description}
            </Text>
          ) : null}

          {next ? (
            <View className="flex-row items-start gap-xs rounded-sm bg-surface-primary p-sm">
              <Icon color="fg-brand" name="calendar" size="sm" />
              <View className="flex-1 gap-3xs">
                <Text className="text-caption-lg text-fg-2">
                  {['Tiếp theo', nextCode, nextWhen].filter(Boolean).join(' · ')}
                </Text>
                <Text className="text-label-md font-semibold text-fg-1" numberOfLines={2}>
                  {nextTitle}
                </Text>
              </View>
            </View>
          ) : null}

          <View className="flex-row items-center justify-end gap-3xs">
            <Text className="text-label-md font-semibold text-fg-brand">{actionLabel}</Text>
            <Icon color="fg-brand" name="arrow-right-small" size="sm" />
          </View>
        </View>
      )}
    </Pressable>
  );
}
