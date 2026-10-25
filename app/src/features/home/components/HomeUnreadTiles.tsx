import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { Card } from '@/shared/ui/card';
import { PulseDot } from '@/shared/ui/effects';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { AnimatedNumber } from '@/shared/ui/motion';
import { Skeleton } from '@/shared/ui/skeleton';
import { moduleTone } from '@/shell/navigation/module-tone';

/** Phần của `GET /me/unread/summary` mà Trang chủ dùng — khai hẹp để test dựng dữ liệu không phải đủ cả DTO. */
export interface HomeUnreadSummary {
  activity: { unread: number };
  conversations: { unreadConversations: number };
}

/**
 * Một con số chưa đọc: đang tải lần đầu → khung xương (giữ chỗ bố cục, `ui-components.md` §1); tải xong mà không có số
 * (mất mạng lần đầu, chưa có bản cache) → `'–'`. ⛔ KHÔNG bịa `0`: "0 tin chưa đọc" là một lời khẳng định.
 */
function Count({
  loading,
  pulse = false,
  unit,
  value,
}: {
  loading: boolean;
  /** Số > 0 thì kèm chấm toả (`PulseDot`) — cho tin nhắn: có người đang chờ trả lời. */
  pulse?: boolean;
  /** Đơn vị đọc cho trình đọc màn hình — "hội thoại chưa đọc", "hoạt động chưa đọc". */
  unit: string;
  value: number | undefined;
}) {
  // Khung xương cao 32 = `lineHeight` của `text-header-md` bên dưới — đổi cỡ số thì đổi cả số này, không thì con số thật
  // về làm thẻ nhảy chiều cao.
  if (loading && value === undefined) return <Skeleton height={32} width={56} />;
  // Con số đứng một mình thì TalkBack đọc "ba" — không biết ba cái gì (tiêu đề của thẻ là một ô khác). Nhãn nói đủ nghĩa;
  // và "–" (chưa có số liệu) không được đọc thành "gạch ngang".
  // ⚠️ `text-header-md` (24/32): MỘT cỡ "con số chính" cho mọi thẻ của Trang chủ (chuỗi, xu, giờ tập trung, ôn tập…) —
  // bản `header-lg` (28/37) cũ làm thẻ này to lệch hẳn so với dải thống kê ngay bên dưới.
  if (value === undefined) {
    return (
      <Text
        accessibilityLabel={`Chưa có số ${unit}`}
        className="text-header-md font-semibold text-fg-1"
      >
        –
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-2xs">
      {/* ⛔ `countOnMount={false}`: đếm từ 0 lúc gắn là hiện "0 chưa đọc" GIẢ trong 600ms — đúng lời khẳng định sai mà hàm
          này cấm. Số chỉ CHẠY khi đổi thật (tin mới qua socket, kéo làm mới); trình đọc màn hình luôn nghe số cuối. */}
      <AnimatedNumber
        accessibilityLabel={`${String(value)} ${unit}`}
        className="text-header-md font-semibold text-fg-1"
        countOnMount={false}
        value={value}
      />
      {pulse && value > 0 ? <UnreadPulse /> : null}
    </View>
  );
}

/**
 * Chấm toả cạnh số tin nhắn chưa đọc. KHÔNG nhãn (⇒ trang trí, ẩn): chữ bên cạnh đã nói "3 hội thoại chưa đọc", chấm chỉ
 * kéo mắt — không phải dấu hiệu duy nhất. Đỏ `error` (mặc định của `PulseDot`) = cùng tông chấm chưa đọc của `CountBadge`.
 * ✅ Tách component: chỉ khi CÓ chấm mới theo dõi tiêu điểm màn — sang tab khác thì vòng toả dừng (chấm vẫn hiện).
 */
function UnreadPulse() {
  const focused = useIsScreenFocused();
  return <PulseDot active={focused} />;
}

/**
 * Một nửa của thẻ tóm tắt: tiêu đề + con số, bấm được sang tab tương ứng. `accessible={false}` ở `Pressable` rồi để
 * CHÍNH TIÊU ĐỀ mang vai `button` — cùng cách `Card` làm với thẻ bấm được (`Card.tsx`, `splitAction`): nếu để `Pressable`
 * gộp cả cây con thì con số (đã có nhãn riêng "3 hội thoại chưa đọc") mất khỏi trình đọc màn hình.
 */
function SummaryHalf({
  bordered = false,
  children,
  icon,
  onPress,
  title,
  tone,
}: {
  bordered?: boolean;
  children: ReactNode;
  icon: IconName;
  onPress: () => void;
  title: string;
  tone: IconTileTone;
}) {
  return (
    <Pressable
      accessible={false}
      className={`min-h-[64px] flex-1 gap-3xs px-md py-sm active:bg-bg-2 ${
        bordered ? 'border-l border-l-divider-1' : ''
      }`}
      onPress={onPress}
    >
      <Text accessibilityRole="button" className="text-body-md text-fg-2" numberOfLines={2}>
        {title}
      </Text>
      {/* Số lớn bên trái, ô icon tông màu bên phải — cùng tông với thẻ phân hệ tương ứng ở khu trên. `flex-1` cho khối số:
          `Text` cạnh ô icon trong `flex-row` mà không có nó thì con số đòi bề rộng nội tại và đẩy ô icon ra ngoài thẻ. */}
      <View className="flex-row items-center gap-sm">
        <View className="flex-1">{children}</View>
        <IconTile name={icon} tone={tone} />
      </View>
    </Pressable>
  );
}

/**
 * Tóm tắt chưa đọc: hội thoại và hộp thư Hoạt động. Cùng nguồn với huy hiệu thanh tab (`useUnreadSummary`), nên số ở
 * đây và số trên tab không thể lệch nhau.
 *
 * MỘT thẻ hai nửa (kẻ dọc ở giữa) thay cho hai thẻ rời: hai thẻ mỗi thẻ đệm 16 + tiêu đề + số cao ~100dp, mà phần lớn
 * thời gian cả hai đều là "0". Khi TẢI XONG và cả hai đều bằng 0 thì thu về MỘT dòng "không có gì mới" — không bắt người
 * dùng đọc hai chữ số 0 (`screen-composition.md` của app tham chiếu: trạng thái rỗng phải gọn hơn trạng thái có dữ liệu).
 * Lối vào hai tab vẫn có ở thanh tab dưới nên không mất đường đi nào.
 */
export function HomeUnreadTiles({
  loading = false,
  summary,
}: {
  /** Đang tải lần đầu (`useUnreadSummary().isLoading`) — hiện khung xương thay vì "–". */
  loading?: boolean;
  summary: HomeUnreadSummary | undefined;
}) {
  const conversations = summary?.conversations.unreadConversations;
  const activity = summary?.activity.unread;

  // ⚠️ `min-h-[86px]` ở CẢ HAI trạng thái = chiều cao tự nhiên của bản hai nửa (đệm 2 × 12 + tiêu đề 20 + khe 2 + ô icon 40).
  // Thiếu nó, "đã xem hết" (72dp) ↔ "có tin mới" (86dp) làm khe thống kê bên dưới nhảy 14dp mỗi lần số chưa đọc về 0 / có
  // tin mới qua socket. Đổi cỡ chữ/ô icon ở `SummaryHalf` thì đổi cả số này.
  if (!loading && conversations === 0 && activity === 0) {
    return (
      <Card className="min-h-[86px] justify-center">
        <View className="flex-row items-center gap-sm">
          <IconTile name="checkmark-circle" tone="success" />
          <Text className="flex-1 text-body-md text-fg-2">
            Bạn đã xem hết — không có tin nhắn hay hoạt động nào chưa đọc.
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <Card className="min-h-[86px] flex-row gap-0 overflow-hidden" padded={false}>
      <SummaryHalf
        icon="chat-bubble"
        title="Tin nhắn chưa đọc"
        tone={moduleTone('messages')}
        onPress={() => router.push('/messages')}
      >
        <Count loading={loading} pulse unit="hội thoại chưa đọc" value={conversations} />
      </SummaryHalf>
      <SummaryHalf
        bordered
        icon="notification"
        title="Hoạt động mới"
        tone={moduleTone('activity')}
        onPress={() => router.push('/activity')}
      >
        <Count loading={loading} unit="hoạt động chưa đọc" value={activity} />
      </SummaryHalf>
    </Card>
  );
}
