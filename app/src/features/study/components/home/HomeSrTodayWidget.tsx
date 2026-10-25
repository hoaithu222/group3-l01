import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/shared/activity-widgets';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { useFeature } from '@/shell/capabilities';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { useSrSummary } from '../../queries/sr.queries';
import { srDueCount } from '../../utils/sr-due';
import { srReviewHref } from '../../utils/study-routes';
import { lightTap } from '../visual/light-tap';
import { srDoneDetail, srDueDetail } from '../sr/sr-today-text';

const TITLE = 'Ôn tập hôm nay';

/** Số trung gian của bộ đếm làm tròn — "12 thẻ cần ôn", không "11,6 thẻ". */
const dueText = (count: number) => `${Math.round(count)} thẻ cần ôn`;

/**
 * Thẻ "Ôn tập hôm nay" ở Trang chủ (đăng ký ở `register-home-widgets.tsx`): số thẻ cần ôn + "Ôn ngay", hoặc "Đã hoàn thành
 * hôm nay" khi hết thẻ mà đã ôn ít nhất một thẻ.
 *
 * Dùng LẠI `useSrSummary` (`GET /sr/summary`, chỉ số đếm — cùng khoá cache với `SrDueWidget` của tab Hoạt động và `SrDueCard`
 * của StudyHome) và `srDueCount` (đến hạn + thẻ mới còn trong ngân sách ngày) nên số khớp mọi nơi và không nhân đôi request.
 * Tự ẩn khi: cờ `study` tắt/chưa biết (không gọi API), lỗi, hoặc người dùng CHƯA từng ôn và không có thẻ nào hôm nay
 * (chưa đăng ký ôn tập — "Đã hoàn thành" ở đây sẽ là nói dối). Tải lần đầu ⇒ khung xương. Trở lại Trang chủ thì làm mới nếu
 * số đã cũ (`useRefetchOnFocus`).
 *
 * ✅ Cùng khuôn thẻ thống kê Trang chủ (nhãn + `IconTile sm` góc phải, số `header-md` đậm đếm lên, một chú thích, `min-h-32`
 * `p-md` — bản gốc ở `gamification/components/home/HomeStatCard.tsx`, ⛔ không import chéo feature).
 * ⚠️ Thẻ KHÔNG bấm cả khối: bên trong đã có nút "Ôn ngay" — nút lồng trong nút thì trình đọc màn hình không tới được.
 */
export function HomeSrTodayWidget() {
  const enabled = useFeature('study') === true;
  const summary = useSrSummary(undefined, enabled);
  useRefetchOnFocus(summary, enabled);

  if (!enabled) return null;
  if (summary.isLoading) {
    return (
      <Section title={TITLE}>
        <Skeleton className="h-32 rounded-md" />
      </Section>
    );
  }
  if (!summary.data) return null;

  const due = srDueCount(summary.data);
  if (due === 0 && summary.data.reviewedToday === 0) return null;

  return (
    <Section title={TITLE}>
      {due > 0 ? (
        <Card className="min-h-32 gap-md">
          <View
            accessibilityLabel={`${dueText(due)}. ${srDueDetail(summary.data)}`}
            accessible
            className="gap-2xs"
          >
            <View className="flex-row items-center gap-sm">
              <Text className="flex-1 text-label-md text-fg-2">Cần ôn hôm nay</Text>
              <IconTile name={STUDY_MODE_META.sr.icon} size="sm" tone={STUDY_MODE_META.sr.tone} />
            </View>
            <AnimatedNumber
              className="text-header-md font-bold text-fg-1"
              format={dueText}
              value={due}
            />
            <Text className="text-caption-lg text-fg-2">{srDueDetail(summary.data)}</Text>
          </View>
          <Button
            fullWidth
            label="Ôn ngay"
            size="sm"
            onPress={() => {
              lightTap();
              router.push(srReviewHref());
            }}
          />
        </Card>
      ) : (
        <Card className="min-h-32">
          <View
            accessibilityLabel={`Đã hoàn thành hôm nay. ${srDoneDetail(summary.data)}`}
            accessible
            className="gap-2xs"
          >
            <View className="flex-row items-center gap-sm">
              <Text className="flex-1 text-label-md text-fg-2">Kết quả hôm nay</Text>
              <IconTile name="checkmark-circle" size="sm" tone="success" />
            </View>
            <Text className="text-header-md font-bold text-fg-1">Đã hoàn thành hôm nay</Text>
            <Text className="text-caption-lg text-fg-2">{srDoneDetail(summary.data)}</Text>
          </View>
        </Card>
      )}
    </Section>
  );
}
