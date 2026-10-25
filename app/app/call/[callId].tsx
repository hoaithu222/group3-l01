import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { CallScreen } from '@/features/calls';
import { callsService } from '@/features/calls/api/calls.service';
import { answerCall, declineCall } from '@/features/calls/hooks/call-actions';
import { stopLockScreenRinging } from '@/features/calls/native/lock-screen-call';
import { callStoreApi, useCallStore } from '@/features/calls/store/call.store';
import { Screen } from '@/shared/ui/screen';
import { RoomChatPanel } from '@/shell/voice-room/RoomChatPanel';

/**
 * p2-01 app.md §1 — màn cuộc gọi TOÀN MÀN, đứng NGOÀI `(app)` (như `invite/[code]`, `m/[id]`): trình bày `fullScreenModal`,
 * tắt cử chỉ vuốt-đóng (khai ở `app/_layout.tsx`). Hàng rào đăng nhập do chính `CallScreen` lo (route này không nằm dưới
 * `(app)/_layout.tsx`). Deep link `superapp://call/<callId>` dùng khi mở từ thông báo cuộc gọi (p2-02).
 *
 * p2-03: phòng thoại kênh (`mode ROOM`) dùng `CallScreen` với chat phòng do route nối (`calls` không import `chat`).
 */

/** Số lần hỏi lại `GET /calls/:id` khi mở nguội — mạng vừa tỉnh dậy cùng lúc app khởi động hay trượt lần đầu. */
const SYNC_ATTEMPTS = 3;
const SYNC_RETRY_MS = 700;

export default function CallRoute() {
  const { action, callId } = useLocalSearchParams<{ action?: string; callId: string }>();
  const phase = useCallStore((state) => state.phase);

  /**
   * `true` = đang hỏi BE xem cuộc gọi này còn sống không (mở NGUỘI từ thông báo).
   *
   * ⛔ Thiếu cờ này là lỗi "bấm Nghe xong vào màn hình thấy *Cuộc gọi đã kết thúc*": lúc route vừa
   * mount, `callStore` còn `idle` nên `CallScreen` vẽ NGAY màn "đã kết thúc", trong khi REST vẫn
   * đang bay. Người dùng đọc được đúng câu sai nhất vào đúng lúc họ vừa bấm nhận cuộc.
   */
  const [resolving, setResolving] = useState(() => Boolean(callId) && callStoreApi.get().callId !== callId);

  // Mở LẠNH từ thông báo: `callStore` chưa biết gì về `callId` này (JS mới khởi động, hoặc cuộc gọi
  // tới lúc app đã đóng hẳn) — lấy REST rồi để `SYNC` (`call-signal.reducer.ts`) tự suy đúng pha:
  // còn trả lời được ⇒ `incoming`; đã hết hạn/kết thúc ⇒ hiện "đã kết thúc" đúng lý do.
  // Bỏ qua khi socket đã dựng `callStore` trước đó (`callId` đã khớp) — không gọi REST thừa.
  useEffect(() => {
    if (!callId || callStoreApi.get().callId === callId) return undefined;
    let cancelled = false;

    const sync = async (attempt: number): Promise<void> => {
      try {
        const call = await callsService.get(callId);
        if (cancelled) return;
        callStoreApi.dispatch({ call, type: 'SYNC' });
        setResolving(false);
      } catch {
        // Mở nguội thì phiên vừa khôi phục xong, mạng vừa tỉnh — trượt lần đầu là chuyện thường.
        if (cancelled) return;
        if (attempt >= SYNC_ATTEMPTS) {
          setResolving(false); // hết cách: để `CallScreen` nói "đã kết thúc" còn hơn treo vô hạn
          return;
        }
        setTimeout(() => void sync(attempt + 1), SYNC_RETRY_MS * attempt);
      }
    };

    void sync(1);
    return () => {
      cancelled = true;
    };
  }, [callId]);

  /**
   * Nút "Nghe"/"Từ chối" trên THÔNG BÁO (p2-02, `CallPushReceiver`) — chỉ tới lượt khi máy đã mở
   * khoá; màn khoá đi đường `IncomingCallActivity`, không qua deep link.
   *
   * Phụ thuộc `phase` chứ không chỉ `action`: cả hai hành động `return` sớm khi
   * `phase !== 'incoming'` (xem `call-actions.ts`), mà lúc route vừa mount store còn rỗng — chạy
   * một lần theo `action` là mất lượt.
   */
  /**
   * Người dùng đã chạm vào thông báo (mở / Nghe / Từ chối) ⇒ TẮT CHUÔNG NGAY, không chờ pha đổi.
   *
   * Dây an toàn độc lập với mọi thứ khác: dù `answer` có lỗi mạng hay `callStore` chưa kịp đồng
   * bộ thì chuông cũng phải câm ngay giây người dùng chạm — treo chuông sau khi đã bấm Nghe là lỗi
   * khó chịu nhất. `stopRinging` chỉ hạ chuông, KHÔNG đóng màn gọi (khác `dismiss`).
   */
  useEffect(() => {
    if (action && callId) stopLockScreenRinging(callId);
  }, [action, callId]);

  const handled = useRef(false);
  useEffect(() => {
    if (!action || handled.current || phase !== 'incoming') return;
    if (callStoreApi.get().callId !== callId) return;
    handled.current = true;
    if (action === 'accept') void answerCall();
    else if (action === 'decline') void declineCall();
  }, [action, callId, phase]);

  // Nền `bg-nav-to` KHỚP với `CallScreen` để không loé một khung hình khác màu khi đổi qua.
  if (resolving) {
    return (
      <Screen className="bg-nav-to" constrained={false} gradient={false} padded={false} scrollable={false}>
        <StatusBar style="light" />
        {/* ⛔ Không dùng `LoadingMore`/`ActivityIndicator`: màn này LUÔN nền tối, còn vòng quay dùng
            chung lấy màu `fg-2` (tối ở chế độ sáng) nên sẽ tan vào nền. Khoảnh khắc này chỉ dài
            vài trăm mili-giây — một dòng chữ là đủ, và nói đúng việc đang xảy ra. */}
        <View
          accessibilityLabel="Đang mở cuộc gọi"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          accessible
          className="flex-1 items-center justify-center bg-nav-to"
        >
          <Text className="text-body-md text-fg-on-nav-muted">
            {action === 'accept' ? 'Đang nhận cuộc gọi…' : 'Đang mở cuộc gọi…'}
          </Text>
        </View>
      </Screen>
    );
  }

  return <CallScreen renderRoomChat={(channelId) => <RoomChatPanel channelId={channelId} />} />;
}
