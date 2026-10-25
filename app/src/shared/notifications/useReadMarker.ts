import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { getDeviceId } from '@/core/device/device-id';
import {
  notificationKeys,
  readStateService,
  type ReadMarkerResult,
  type ReadStreamType,
} from '@/core/notifications';
import { useAppActive } from '@/shared/hooks/useAppActive';

import { applyReadResult } from './apply-read-result';
import { READ_MARKER_DEBOUNCE_MS, SUMMARY_REFRESH_AFTER_READ_MS } from './notifications.constants';

export interface UseReadMarkerOptions {
  /** `false` = không bao giờ gửi (vd: chưa biết quyền, hoặc scope không có mốc đọc). */
  enabled?: boolean;
  /** Mốc đã đọc client BIẾT (vd `detail.lastReadSeq`) — không gửi lại tin cũ hơn nó. */
  knownLastReadSeq?: number;
  /** Sau khi server xác nhận — nơi gọi vá cache riêng của mình (vd danh sách hội thoại). */
  onMarked?: (result: ReadMarkerResult) => void;
  streamId: string;
  streamType: ReadStreamType;
}

/**
 * Đặt mốc "đã đọc" (p1-07 `app.md` §4.2) — CHỈ khi màn đang focus + app ở foreground + tin thực sự đã HIỂN THỊ.
 *
 * ⛔ Nhận socket ≠ đã đọc (NT-02): hàm này chỉ được gọi từ viewability của danh sách (`onVisibleMaxSeq`), không từ
 * `message:created`. Đang đọc tin cũ ở đầu danh sách thì tin mới ở cuối không được đánh dấu.
 *
 * Cơ chế:
 *  · `onVisibleMaxSeq(seq)` chỉ ghi nhận khi đang active và `seq` lớn hơn mọi thứ đã gửi/đang chờ (mốc CHỈ TĂNG);
 *  · gom trong `READ_MARKER_DEBOUNCE_MS` rồi gửi MỘT lần;
 *  · rời màn (blur) / ra nền / unmount → gửi NGAY phần đang chờ, không đợi debounce.
 *
 * Lỗi (404 mất quyền, 429 quá 120/phút, mất mạng) bị nuốt: mất một mốc đọc không mất dữ liệu, lần hiển thị sau gửi lại.
 */
export function useReadMarker({
  enabled = true,
  knownLastReadSeq,
  onMarked,
  streamId,
  streamType,
}: UseReadMarkerOptions): { onVisibleMaxSeq: (seq: number) => void } {
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  const appState = useAppActive();
  const active = enabled && focused && appState === 'active';

  const activeRef = useRef(active);
  const sentSeq = useRef(knownLastReadSeq ?? 0);
  const pendingSeq = useRef(0);
  const inFlightSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const deviceId = useRef<string | undefined>(undefined);
  const knownRef = useRef(knownLastReadSeq);
  const latest = useRef({ onMarked, streamId, streamType });

  useEffect(() => {
    activeRef.current = active;
    latest.current = { onMarked, streamId, streamType };
  });

  useEffect(() => {
    void getDeviceId().then((id) => {
      deviceId.current = id;
    });
  }, []);

  // Mốc biết trước tăng lên (vd: máy khác đọc) thì không gửi lại tin cũ hơn nó. ⚠️ KHAI TRƯỚC effect đổi luồng bên
  // dưới: React chạy phần khởi tạo theo thứ tự khai báo, effect đổi luồng cần đọc `knownRef` đã cập nhật.
  useEffect(() => {
    knownRef.current = knownLastReadSeq;
    if (knownLastReadSeq !== undefined) sentSeq.current = Math.max(sentSeq.current, knownLastReadSeq);
  }, [knownLastReadSeq]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
    const seq = pendingSeq.current;
    // `inFlightSeq`: cùng một mốc đang bay thì đừng gửi đôi.
    if (seq <= sentSeq.current || seq <= inFlightSeq.current) return;
    const target = latest.current;
    inFlightSeq.current = seq;

    void readStateService
      .mark({
        deviceId: deviceId.current,
        lastReadSeq: seq,
        streamId: target.streamId,
        streamType: target.streamType,
      })
      .then((result) => {
        // Đã đổi sang luồng khác trong lúc chờ: kết quả này thuộc luồng CŨ, đừng làm bẩn mốc của luồng mới.
        if (latest.current.streamId === target.streamId) {
          sentSeq.current = Math.max(sentSeq.current, result.lastReadSeq);
        }
        target.onMarked?.(result);
        applyReadResult(queryClient, result); // vá chấm/số chưa đọc của kênh + luồng đang cache
        // Số chuẩn của server (patch cục bộ chỉ là tối ưu) — lùi lại một nhịp để gom nhiều lần đọc liên tiếp.
        setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadSummary });
          void queryClient.invalidateQueries({ queryKey: notificationKeys.workspaceUnreadAll });
          // Lớp bảo hiểm cho HÀNG "danh sách hội thoại" (`['conversations','list',…]`): màn hội thoại đã tự vá
          // NGAY qua `onMarked` (`patchConversationRead`, độ trễ cảm nhận ≈0), nhưng vá đó bỏ qua im lặng khi
          // hàng chưa có sẵn trong cache lúc gọi (`applyConversationReadInList` không tìm thấy) — invalidate ở
          // đây (CÙNG nhịp 3s trên, không đợi thêm) để lần sau vẫn có số chuẩn thay vì kẹt sai mãi.
          // Khoá viết THẲNG, không `import` từ `@/features/conversations`: `shared/` không được phụ thuộc ngược
          // vào một feature cụ thể (`docs/rules/feature-structure.md`) — đối chiếu `conversationKeys.all` nếu tiền tố đổi.
          // KHÔNG làm tương tự cho kênh: danh sách kênh không tự cache badge riêng, số chưa đọc luôn tính lại
          // từ CHÍNH `workspaceUnreadAll` (đã invalidate ở dòng trên) qua `withChannelUnread` — invalidate thêm
          // `['channels', …]` ở đây chỉ tốn request cho chi tiết/thành viên/grant của MỌI kênh, không đổi số nào.
          if (result.streamType === 'CONVERSATION') {
            void queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
          }
        }, SUMMARY_REFRESH_AFTER_READ_MS);
      })
      .catch(() => {
        pendingSeq.current = 0; // nuốt lỗi: lần hiển thị sau thử lại đúng mốc này
      })
      .finally(() => {
        inFlightSeq.current = 0;
      });
  }, [queryClient]);

  const onVisibleMaxSeq = useCallback(
    (seq: number) => {
      if (!activeRef.current) return;
      if (seq <= Math.max(sentSeq.current, pendingSeq.current)) return;
      pendingSeq.current = seq;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, READ_MARKER_DEBOUNCE_MS);
    },
    [flush],
  );

  // Blur / ra nền: gửi NGAY phần đang chờ (người dùng sắp rời đi, không thể đợi debounce).
  useEffect(() => {
    if (!active) flush();
  }, [active, flush]);

  // Đổi luồng (cùng component, id khác — `router.replace` ở bố cục hai cột) hoặc unmount: gửi nốt của luồng CŨ
  // (`latest` còn giữ id cũ vì effect cập nhật nó chạy SAU cleanup), rồi khởi tạo lại mốc cho luồng mới.
  useEffect(() => {
    sentSeq.current = knownRef.current ?? 0;
    pendingSeq.current = 0;
    inFlightSeq.current = 0;
    return () => flush();
  }, [streamType, streamId, flush]);

  return { onVisibleMaxSeq };
}
