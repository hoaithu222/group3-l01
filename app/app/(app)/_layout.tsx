import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useMemo } from 'react';

import { appConfig } from '@/core/config/env.config';
import { CallButtons, CallHistoryEntry, CallSummaryMessage, MiniCallBar } from '@/features/calls';
import { SkillUnlockedHost } from '@/features/career';
import { registerSystemMessageRenderer } from '@/features/chat';
import { MeetingRoomHost } from '@/features/meeting-room';
import { GamificationEventHost, ProfileGamificationBlock } from '@/features/gamification';
import { useConversationReadSync } from '@/features/conversations/hooks/useConversationReadSync';
import { useConversationSocket } from '@/features/conversations/hooks/useConversationSocket';
import { useMeetingSocketSync } from '@/features/meetings/hooks/useMeetingSocketSync';
import { ModerationHost, useBlockedSync } from '@/features/moderation';
import { WalletReminderMessage } from '@/features/wallet';
import { WellbeingAlertHost } from '@/features/wellbeing';
import { registerCallActionsRenderer, registerCallHistoryEntryRenderer } from '@/shared/calls';
import { registerProfileExtrasRenderer } from '@/shared/profile';
import { useSavedSync } from '@/shared/saved';
import { ConnectionBanner } from '@/shared/ui/connection-banner';
import { PATHS } from '@/shell/config';
import {
  InAppMessageBannerHost,
  PushPrimerHost,
  useAppIconBadge,
  useReadStateSync,
} from '@/shell/notifications';
import { AppTabBar } from '@/shell/navigation/AppTabBar';
import { ModulePickerSheet } from '@/shell/navigation/ModulePickerSheet';
import { HOME_MODULE, MODULE_REGISTRY } from '@/shell/navigation/module-registry';
import { seedHomeInTabHistory } from '@/shell/navigation/tab-history';
import { useTabScreenOptions } from '@/shell/navigation/tab-screen-options';
import { useTabModules } from '@/shell/navigation/use-accessible-modules';
import { useAuthStore } from '@/shell/store/slices/auth';
// Thẻ chat đăng ký ở module scope (side-effect; `chat` không import feature nguồn): p2-06 `MEETING_RECAP`/`MEETING_RECORDING_READY`, p6-03 `MENTOR_JOINED`/`MENTOR_LEFT`.
import '@/shell/chat/register-meeting-cards';
import '@/shell/chat/register-mentor-cards';
import '@/shell/home-widgets/register-stats-widgets';

/**
 * p6-04: thẻ tin hệ thống `WALLET_REMINDER` ("N bạn còn khoản chưa thanh toán — Mở ví", không số tiền).
 * Đăng ký Ở ĐÂY (nơi lắp ráp, module scope) chứ không trong `chat` hay `wallet`: hai feature không import nhau, và đăng ký trong effect của một màn thì tin nhắc ĐẦU TIÊN vẫn ra
 * "Nội dung chưa hỗ trợ". Chạy đúng một lần khi nhóm route `(app)` được nạp — trước mọi danh sách tin nhắn.
 */
registerSystemMessageRenderer('WALLET_REMINDER', (message) => (
  <WalletReminderMessage message={message} />
));

/**
 * p2-01: cuộc gọi — cùng lý do đăng ký ở nơi lắp ráp (module scope, trước mọi màn): `CALL_SUMMARY` là thẻ "Gọi lại" trong chat; nút gọi ở
 * header hội thoại/kênh và nút "Cuộc gọi" ở header danh sách đi qua slot `@/shared/calls` (`conversations` không import `calls`).
 */
registerSystemMessageRenderer('CALL_SUMMARY', (message) => (
  <CallSummaryMessage message={message} />
));
registerCallActionsRenderer((props) => <CallButtons {...props} />);
registerCallHistoryEntryRenderer(() => <CallHistoryEntry />);

/**
 * p4-03: cấp độ + chuỗi ngày trong thẻ hồ sơ màn Tôi — `me` không import `gamification`, nên đi qua khe `@/shared/profile`
 * (đăng ký ở module scope, trước mọi màn). `ProfileGamificationBlock` tự ẩn khi cờ `gamification` tắt.
 */
registerProfileExtrasRenderer(() => <ProfileGamificationBlock />);

/**
 * Layout của nhóm màn hình ĐÃ ĐĂNG NHẬP — vừa là hàng rào, vừa là thanh tab dưới.
 *
 * ⚠️ `Tabs` nhập từ `expo-router/js-tabs`, KHÔNG phải từ `expo-router`. Ở SDK 57
 * lối nhập cũ đã deprecated (nó nhường tên `Tabs` cho bộ tab NATIVE). Giữ lối
 * cũ thì hôm nay vẫn chạy, nhưng bản SDK sau gỡ đi là gãy cả cây route.
 */
export default function AppLayout() {
  const status = useAuthStore((state) => state.status);
  const visibleModules = useTabModules();
  const tabScreenOptions = useTabScreenOptions();
  /**
   * app.md p1-05 §4.2 — mount MỘT LẦN ở đây (không phải chỉ khi mở tab `messages`) để badge/unread đúng dù người dùng đang ở tab khác. Gọi TRƯỚC `return` sớm bên dưới — Rules of Hooks,
   * và guard chỉ chặn MÀN HÌNH chứ không cần chặn việc lắng nghe (chưa đăng nhập thì socket chưa kết nối, hook này tự im lặng).
   */
  useConversationSocket();
  /** p1-07: `read:updated` của hội thoại (đọc ở máy khác) → hạ chấm/số chưa đọc của danh sách + chi tiết. */
  useConversationReadSync();
  /** p1-07: socket → số chưa đọc/hộp thư (huy hiệu tab); số trên icon app = `badgeTotal` của tóm tắt. Mount một lần, độc lập màn đang mở. */
  useReadStateSync();
  useAppIconBadge();
  /** p1-09: `saved:updated` (đa thiết bị) → cờ "đã lưu" của menu tin + danh sách "Đã lưu" — mount một lần, không phụ thuộc màn nào đang mở. */
  useSavedSync();
  /** p1-08: danh sách người MÌNH đã chặn (`useBlockedIds`) + `block:updated` đa thiết bị — chat thu gọn tin đúng dù chưa mở `me/blocked`. */
  useBlockedSync();
  /** p2-04: socket `meeting:*` → cache lịch/chi tiết (app.md §4.2) — mount một lần, lời mời mới cập nhật dù đang ở tab khác. */
  useMeetingSocketSync();

  /**
   * Phân hệ nào được hiện tab.
   *
   * ⛔ Phải duyệt TOÀN BỘ `MODULE_REGISTRY` chứ không chỉ danh sách đã lọc.
   *
   * Expo Router tự tạo một tab cho MỌI file trong thư mục này. Nếu ta chỉ khai
   * `<Tabs.Screen>` cho các phân hệ được phép, thì phân hệ bị chặn quyền vẫn
   * hiện ra một tab — do Expo Router tự sinh, với nhãn là tên file và không có
   * biểu tượng. Cách duy nhất để giấu nó là khai tường minh với `href: null`.
   */
  const visibleIds = useMemo(
    () => new Set(visibleModules.map((module) => module.id)),
    [visibleModules],
  );

  /**
   * Hàng rào: chưa đăng nhập thì về màn đăng nhập.
   *
   * Tới được đây nghĩa là `status` đã rời khỏi `restoring` — `app/_layout.tsx`
   * chặn không cho vẽ trước lúc đó. Nên `!== 'authenticated'` ở đây là kết luận
   * chắc chắn, không phải phỏng đoán trong lúc còn đang tải.
   */
  if (appConfig.authEnabled && status !== 'authenticated') {
    return <Redirect href={PATHS.LOGIN} />;
  }

  return (
    /**
     * `ConnectionBanner` vẽ banner ở TRÊN CÙNG (tự ẩn/hiện theo `useConnectionState()` — không tốn chỗ khi `connected`,
     * trả `null` chứ không phải `opacity: 0`) rồi bọc phần còn lại làm `children`: khi banner hiện, nó đã né thanh trạng
     * thái nên `children` thấy `insets.top = 0` (không thì `AppBar` cộng vùng an toàn lần hai ⇒ khoảng trống dư).
     * Bọc bằng `Provider` chứ không phải `View`, nên `Tabs` vẫn là navigator gốc — bọc thêm một `View` ở NGOÀI mới làm
     * lệch cách nó tự đo `flex: 1`.
     */
    <>
      <ConnectionBanner>
        {/* p2-01: thanh "Quay lại cuộc gọi" khi thu nhỏ — phải nằm ngay trên thanh tab nên ở lại đây.
            ⛔ Bộ máy cuộc gọi (`CallRuntime`) và cầu native đã dời lên `app/_layout.tsx`: nhóm `(app)`
            KHÔNG mount khi app mở nguội thẳng vào `call/[callId]` từ thông báo — xem KDoc `CallRuntime`. */}
        <MiniCallBar />
        {/* p2-05: giữ phòng họp khi thu nhỏ (MiniBar) + socket phòng sống ngoài màn phòng; thiếu nó thì Back trong phòng hỏi "Rời cuộc họp?" thay vì thu nhỏ. */}
        <MeetingRoomHost />
        <Tabs
          /**
           * ⛔ Nút Back giữa các tab = về tab VỪA XEM TRƯỚC ĐÓ. Mặc định của React Navigation là `firstRoute`
           * (luôn nhảy về Trang chủ, bỏ qua tab đứng ngay trước) — đó là lỗi "back không về trang vừa truy cập".
           * `seedHomeInTabHistory` đặt Trang chủ vào đáy lịch sử khi mở nguội vào tab khác, để Back vẫn có chỗ về.
           * Lý do đầy đủ và số đo ở `tab-history.ts`.
           */
          backBehavior="history"
          /** ⛔ Tắt header của navigator + mờ chéo khi đổi tab — lý do ở `tab-screen-options.ts`. */
          screenOptions={tabScreenOptions}
          /**
           * ⛔ Thanh tab là component của BỘ CHUNG (`BottomNav`), không phải thanh
           * mặc định của React Navigation — xem `AppTabBar.tsx` để biết vì sao.
           */
          tabBar={(props) => <AppTabBar {...props} />}
          UNSTABLE_router={seedHomeInTabHistory}
        >
          {/*
           * Trang chủ = `app/(app)/index.tsx`, nút GIỮA của thanh tab. Khai ĐẦU TIÊN để nó là route đầu của
           * navigator và là tab mở mặc định — đáy của lịch sử Back (`backBehavior="history"` ở trên): lùi hết
           * các tab đã xem thì về Trang chủ rồi mới thoát app. Thứ tự hiện trên thanh tab do `AppTabBar`
           * tự xếp theo registry.
           */}
          <Tabs.Screen name="index" options={{ title: HOME_MODULE.title }} />

          {/*
           * Chỉ phân hệ có thư mục route cấp `(app)/` (`name`) mới khai được `<Tabs.Screen>`; phân hệ `menu`
           * (`study`, `meetings`…) LUÔN `href: null` — có route, vào được bằng đường dẫn/danh sách chọn phân
           * hệ, nhưng không có tab. Phân hệ `menu` không `name` (`/messages/calls`) không có gì để khai.
           */}
          {MODULE_REGISTRY.flatMap((module) =>
            module.name
              ? [
                  <Tabs.Screen
                    key={module.name}
                    name={module.name}
                    options={{
                      title: module.title,
                      href:
                        module.placement === 'bar' && visibleIds.has(module.id) ? undefined : null,
                    }}
                  />,
                ]
              : [],
          )}
        </Tabs>
      </ConnectionBanner>
      {/* Danh sách chọn phân hệ: giữ nút Trang chủ hoặc nút "Tất cả" ở Trang chủ (`useModulePickerStore`). */}
      <ModulePickerSheet />
      {/* p4-03: socket `gamification:updated` → modal lên cấp + toast huy hiệu mới; mount MỘT lần, hiện ở mọi màn (hoãn khi đang thi/gọi/họp). */}
      <GamificationEventHost />
      {/* p6-06: socket `skill:unlocked` → tấm chúc mừng huy hiệu kỹ năng (một lần/kỹ năng); mount MỘT lần, hiện ở mọi màn (cờ `career` tắt thì im). */}
      <SkillUnlockedHost />
      {/* p7-03: socket `wellbeing:alert` + `pendingAlert` → thẻ nhắc nghỉ ngơi mềm ("Đã hiểu"/"Nhắc lại sau"); mount MỘT lần, hoãn khi đang thi/gọi/họp, cờ `burnout` tắt thì im. */}
      <WellbeingAlertHost />
      {/* p1-08: tấm Báo cáo / xác nhận Chặn mà chat, members, channels, conversations "yêu cầu" qua store — mount MỘT lần. */}
      <ModerationHost />
      {/* p0-06: tấm mời bật thông báo — hiện MỘT lần khi người dùng lần đầu mở hội thoại/vào nhóm, "Để sau" giữ 7 ngày. */}
      <PushPrimerHost />
      {/* p1-07: banner tin nhắn khi app đang mở mà tin thuộc cuộc trò chuyện khác (thay banner hệ thống ở foreground). */}
      <InAppMessageBannerHost />
    </>
  );
}
