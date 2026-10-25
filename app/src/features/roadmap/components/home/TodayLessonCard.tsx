import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { useNow } from '@/shared/hooks/useNow';
import { MOTION_DURATION, ShimmerSweep } from '@/shared/ui';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type { RoadmapTodayItemDto } from '../../api/roadmap.types';
import { useTodayLessons } from '../../hooks/useTodayLessons';
import { useRoadmapSubjects } from '../../queries/roadmap.queries';
import { lessonCode, lessonDisplayTitle } from '../../utils/lesson-title';
import { dateKeyToDay, formatPlanDay, todayDay } from '../../utils/roadmap-dates';
import { roadmapLessonHref } from '../../utils/roadmap-routes';
import { MetaTag } from '../common/MetaTag';
import { ProgressBar } from '../common/ProgressBar';

const NOW_REFRESH_MS = 5 * 60_000;

/**
 * Câu mở đầu theo NGÀY dự kiến thật của buổi, không cứng "Hôm nay" như trước: `GET /roadmap/today` trả buổi bắt buộc
 * KẾ TIẾP của mỗi môn — buổi đó có thể đã trễ (phải học bù) hoặc còn vài hôm nữa (Thứ 5 mới tới lịch). Ghi "Hôm nay"
 * cho cả ba ca là nói sai với người học.
 */
function headingOf(
  item: RoadmapTodayItemDto,
  today: number | null,
): { overdue: boolean; text: string } {
  const day = dateKeyToDay(item.plannedDate);
  if (day === null || today === null) return { overdue: false, text: 'Học tiếp' };
  if (day < today) return { overdue: true, text: 'Cần học bù' };
  if (day === today) return { overdue: false, text: 'Hôm nay học' };
  if (day === today + 1) return { overdue: false, text: 'Ngày mai học' };
  return { overdue: false, text: `Sắp tới · ${formatPlanDay(day, today)}` };
}

/**
 * Thanh tiến độ CẢ MÔN. `GET /roadmap/today` không kèm % ⇒ lấy `myEnrollment.percent` của `GET /roadmap/subjects` (cùng khoá cache
 * với tab "Lộ trình", `staleTime` 60 s — ⛔ không tự suy % từ số buổi: có buổi tự chọn, có buổi học vượt). Chưa có số (đang tải,
 * lỗi, môn không có trong danh sách) ⇒ KHÔNG vẽ, thay vì vẽ 0% sai. Tách thành phần riêng để truy vấn chỉ chạy khi CÓ thẻ để vẽ.
 */
function SubjectProgress({ subjectId, subjectTitle }: { subjectId: string; subjectTitle: string }) {
  const subjects = useRoadmapSubjects();
  const raw = subjects.data?.find((subject) => subject.id === subjectId)?.myEnrollment?.percent;
  if (raw === undefined || !Number.isFinite(raw)) return null;
  const percent = Math.max(0, Math.min(100, Math.round(raw)));

  return (
    <View className="flex-row items-center gap-xs">
      <View className="flex-1">
        <ProgressBar
          accessibilityLabel={`Tiến độ môn ${subjectTitle}: ${String(percent)}%`}
          percent={percent}
          size="sm"
          tone={percent >= 100 ? 'success' : 'brand'}
        />
      </View>
      {/* Số đã nằm trong nhãn + `accessibilityValue` của thanh ⇒ ẩn khỏi trình đọc màn hình (khỏi đọc hai lần). */}
      <Text
        accessibilityElementsHidden
        className="text-caption-sm font-semibold text-fg-2"
        importantForAccessibility="no-hide-descendants"
      >
        {`${String(percent)}%`}
      </Text>
    </View>
  );
}

/**
 * Thẻ "Hôm nay học gì" (README §4 luồng 5) — đầu tab "Của tôi" của `StudyHomeScreen` (app.md §3): mỗi môn đang học một
 * thẻ, nói rõ học bù/hôm nay/sắp tới, tên môn (người học có thể học NHIỀU môn cùng lúc), buổi kế + số buổi trễ + thanh tiến độ môn.
 *
 * ⚠️ ẨN HOÀN TOÀN (trả `null`) khi không có enrollment ACTIVE nào — kể cả lúc đang tải hay lỗi: app.md §3 nói rõ
 * "không thêm khung xương", vì đây là widget PHỤ ở đầu một tab vốn còn nhiều nội dung khác đứng sau nó.
 *
 * ✅ Nút "Vào học" (nền `action-base` đậm) có ÁNH QUÉT MỘT LẦN, đi sau nhịp hiện dần của màn; thẻ sau trễ thêm một nhịp để nhiều môn
 * không loé cùng lúc. ⛔ Không `loop`: vòng lặp nổi bật duy nhất của màn Học là `BorderBeam` của thẻ ôn tập bên dưới.
 * `active` theo `useIsScreenFocused` ⇒ màn đang bị che thì chưa quét; "Giảm chuyển động" ⇒ không quét.
 */
export function TodayLessonCard() {
  const { items } = useTodayLessons();
  const today = todayDay(useNow(NOW_REFRESH_MS));
  const focused = useIsScreenFocused();
  if (items.length === 0) return null;

  return (
    <View className="gap-xs px-md pb-sm">
      {items.map((item, index) => {
        const { lessonLabel } = item.subject;
        const heading = headingOf(item, today);
        const code = lessonCode(lessonLabel, item.lesson.number);
        const title = lessonDisplayTitle(item.lesson.title, lessonLabel, item.lesson.number);
        return (
          <Card
            key={item.lesson.id}
            footer={
              // ⛔ Cha `overflow-hidden` CÙNG bo góc với nút (`rounded-full`) — không thì dải sáng lòi ra ngoài viên nút.
              <View className="overflow-hidden rounded-full">
                <Button
                  accessibilityLabel={`Vào học ${code}, ${item.subject.title}`}
                  fullWidth
                  label={heading.overdue ? 'Học bù ngay' : 'Vào học'}
                  size="sm"
                  onPress={() => router.push(roadmapLessonHref(item.subject.id, item.lesson.id))}
                />
                <ShimmerSweep
                  active={focused}
                  className="rounded-full"
                  delay={MOTION_DURATION.slow + index * MOTION_DURATION.base}
                />
              </View>
            }
          >
            <View className="gap-sm">
              <View className="flex-row items-start gap-sm">
                <IconTile
                  name={heading.overdue ? 'alert-warning' : 'calendar'}
                  size="sm"
                  tone={heading.overdue ? 'warning' : 'brand'}
                />
                <View className="flex-1 gap-3xs">
                  <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
                    {`${heading.text} · ${item.subject.title}`}
                  </Text>
                  <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
                    {`${code} · ${title}`}
                  </Text>
                  {item.behind > 0 ? (
                    <MetaTag
                      icon="alert-warning"
                      label={`Trễ ${String(item.behind)} ${lessonLabel.toLowerCase()} so với lịch`}
                      tone="warning"
                    />
                  ) : null}
                </View>
              </View>
              <SubjectProgress subjectId={item.subject.id} subjectTitle={item.subject.title} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}
