import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { RADIUS } from '@/shared/theme';
import { AnimatedNumber, BorderBeam } from '@/shared/ui';
import { Button } from '@/shared/ui/button';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatNumber } from '@/shared/utils/format/currency.utils';

import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { useSrSummary } from '../../queries/sr.queries';
import { srDueCount } from '../../utils/sr-due';
import { srReviewHref } from '../../utils/study-routes';
import { EnterView } from '../visual/EnterView';
import { lightTap } from '../visual/light-tap';
import { StatPill } from '../visual/StatPill';
import { useSweep } from '../visual/use-sweep';
import { SrDueArt } from './SrDueArt';
import { srDoneDetail, srDueDetail, srTodayProgress } from './sr-today-text';

const RING_SIZE = 56;

/**
 * ✅ `AnimatedNumber` đếm CẢ câu trong MỘT `Text`: trình đọc màn hình nghe một câu với số CUỐI (không nghe số trung gian), và
 * câu vẫn là một chuỗi liền "12 thẻ cần ôn hôm nay" — ⛔ đừng tách số ra `Text` lồng cỡ chữ khác (Android cắt dấu dòng lẫn cỡ).
 */
const dueTitle = (value: number) => `${formatNumber(Math.round(value))} thẻ cần ôn hôm nay`;

/**
 * Thẻ "Hôm nay" ở đầu Trang chủ Học (app.md p4-02 §2 `SrDueCard`) — điểm nhấn CHÍNH của màn: "N thẻ cần ôn hôm nay" (số chạy),
 * vòng tiến độ + MỘT nút "Ôn ngay". Nhãn/tông vòng theo chế độ `sr` của `STUDY_MODE_META`.
 *
 * Dữ liệu là `GET /sr/summary` (cùng khoá cache với widget Hoạt động và Trang chủ ứng dụng — số khớp mọi nơi): `srDueCount` (đến hạn +
 * thẻ mới còn trong ngân sách ngày) là số CÒN PHẢI ôn; vòng = đã ôn ÷ (đã ôn + còn phải ôn) — ⛔ không bịa "mục tiêu ngày". Chuỗi ôn
 * chỉ hiện khi API trả > 0.
 *
 * Bốn trạng thái: đang tải ⇒ khung xương cùng cỡ (thẻ về không đẩy danh sách nhảy); lỗi ⇒ ẩn (đây chỉ là gợi ý, lỗi đã có nơi khác
 * báo); còn thẻ ⇒ thẻ nổi `bg-1` bọc `BorderBeam` + xấp thẻ xoè + nút; hết thẻ mà hôm nay ĐÃ ôn ⇒ thẻ xanh "Đã hoàn thành hôm nay"
 * tĩnh (hình tick, không nút). Hết thẻ mà CHƯA từng ôn (chưa đăng ký ôn tập) ⇒ ẩn — "hoàn thành" ở đó là nói dối.
 *
 * ⛔ `BorderBeam` là vòng lặp nổi bật DUY NHẤT của màn Học (luật một vòng lặp mỗi màn) — chỉ khi CÒN thẻ, dừng khi màn bị che
 * (`useIsScreenFocused`), "Giảm chuyển động" ⇒ chỉ còn viền tĩnh. Trạng thái "xong" cố ý không có gì chuyển động: xong rồi thì
 * đừng gọi mắt người dùng nữa.
 */
export function SrDueCard() {
  const summary = useSrSummary();
  const focused = useIsScreenFocused();
  const data = summary.data;
  const due = srDueCount(data);
  const done = due === 0;
  const hidden = !data || (done && data.reviewedToday === 0);
  const progress = srTodayProgress(data?.reviewedToday ?? 0, due);
  // Thẻ ẩn/đang tải/đã xong (không có vòng) thì đích là 0 (= đang ở 0 ⇒ hook không chạy khung nào). ⛔ Đừng truyền 1 khi không vẽ
  // vòng: nó sẽ quét trong nền cho một hình không ai thấy (mỗi khung là một lần vẽ lại vô ích).
  const swept = useSweep(hidden || done ? 0 : progress);

  // ≈ cao của thẻ "còn thẻ" (đệm 32 + hàng tiêu đề 66 + vòng 56 + nút 48 + hai khe 16 ≈ 234dp) — ca thường gặp nhất khi mở màn.
  if (summary.isLoading) return <Skeleton className="h-56 rounded-md" />;
  if (hidden) return null;

  if (done) {
    return (
      <EnterView>
        <View className="flex-row items-center gap-sm rounded-md border-hairline border-border-success-subtle bg-surface-success p-md">
          <View className="flex-1 gap-3xs">
            <Text className="text-overline text-fg-2">{STUDY_MODE_META.sr.label}</Text>
            <Text accessibilityRole="header" className="text-header-sm font-semibold text-fg-1">
              Đã hoàn thành hôm nay
            </Text>
            <Text className="text-body-md text-fg-2">{srDoneDetail(data)}</Text>
          </View>
          <SrDueArt variant="done" />
        </View>
      </EnterView>
    );
  }

  const reviewed = data.reviewedToday;
  const percent = Math.round(progress * 100);
  const pills = reviewed > 0 || data.reviewStreakDays > 0;

  return (
    <EnterView>
      {/* ⚠️ Không `border-*` riêng: viền nhạt tĩnh của `BorderBeam` CHÍNH là viền thẻ — thêm hairline là hai đường chồng lệch nửa nét. */}
      <BorderBeam
        active={focused}
        className="gap-md rounded-md bg-bg-1 p-md"
        radius={RADIUS.md}
        tone="fg-brand"
      >
        <View className="flex-row items-center gap-sm">
          <View className="flex-1 gap-3xs">
            <Text className="text-overline text-fg-2">{STUDY_MODE_META.sr.label}</Text>
            <AnimatedNumber
              accessibilityRole="header"
              className="text-header-sm font-semibold text-fg-1"
              format={dueTitle}
              value={due}
            />
            <Text className="text-body-md text-fg-2">{srDueDetail(data)}</Text>
          </View>
          <SrDueArt variant="due" />
        </View>

        <View className="flex-row items-center gap-sm">
          <ProgressRing
            label={`Tiến độ ôn hôm nay: đã ôn ${reviewed}, còn ${due} thẻ`}
            progress={swept}
            size={RING_SIZE}
            tone="success"
          >
            <Text className="text-label-sm font-semibold text-fg-1">{`${percent}%`}</Text>
          </ProgressRing>
          <View className="flex-1 flex-row flex-wrap gap-xs">
            {reviewed > 0 ? (
              <StatPill
                icon="checkmark-circle"
                iconColor="success"
                label={`Đã ôn ${reviewed} thẻ`}
              />
            ) : null}
            {data.reviewStreakDays > 0 ? (
              <StatPill
                icon="calendar-favorite"
                iconColor="success"
                label={`Chuỗi ôn ${data.reviewStreakDays} ngày`}
              />
            ) : null}
            {/* Vòng 0% đứng một mình trông như lỗi tải — nói bằng chữ vòng đang đo gì. Trình đọc màn hình đã nghe nhãn của vòng. */}
            {pills ? null : (
              <Text
                accessibilityElementsHidden
                className="text-body-md text-fg-2"
                importantForAccessibility="no-hide-descendants"
              >
                Hôm nay bạn chưa ôn thẻ nào
              </Text>
            )}
          </View>
        </View>

        <Button
          fullWidth
          iconRight="arrow-right-small"
          label="Ôn ngay"
          onPress={() => {
            lightTap();
            router.push(srReviewHref());
          }}
        />
      </BorderBeam>
    </EnterView>
  );
}
