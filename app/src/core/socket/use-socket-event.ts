import { useEffect, useRef } from 'react';

import { captureException } from '@/core/monitoring';
import { logger } from '@/shared/utils/logger';

import { socket } from './socket.client';

/**
 * Lắng nghe một sự kiện Socket.IO trong vòng đời component.
 *
 * ```tsx
 * useSocketEvent(SocketEvent.MESSAGE_CREATED, (payload: MessagePayload) => {
 *   queryClient.setQueryData(['messages', payload.channelId], (old) => …);
 * });
 * ```
 *
 * ── `handlerRef` — vì sao KHÔNG đưa `handler` vào mảng phụ thuộc của effect ──
 * Phần lớn nơi gọi truyền một hàm nội tuyến (`(p) => setX(p)`), tức là một
 * tham chiếu MỚI ở mỗi lần render. Đưa `handler` vào deps thì effect chạy lại
 * (gỡ rồi đăng ký lại listener) ở MỌI lần render của component gọi hook — với
 * sự kiện bắn dồn dập (`typing`, `presence:updated`) đó là một vòng lặp
 * gỡ/đăng ký liên tục, tốn CPU và có khe hở mất đúng sự kiện rơi vào giữa lúc
 * gỡ/đăng ký lại. Ghi `handler` mới nhất vào `ref` bằng một effect KHÔNG có
 * mảng phụ thuộc (chạy sau MỌI lần render, ⛔ không phải ngay trong lúc render
 * — `react-hooks/refs` cấm ghi `ref.current` khi đang render, và React
 * Compiler dựa đúng vào ràng buộc đó) rồi để listener LUÔN gọi qua `ref` —
 * effect ĐĂNG KÝ listener khi đó chỉ còn phụ thuộc `event`, và với `event` là
 * một hằng chuỗi thì nó chỉ chạy đúng một lần lúc mount.
 *
 * ── Vì sao bọc `try/catch` quanh handler ────────────────────────────────────
 * Emitter của Socket.IO gọi lần lượt mọi listener của MỘT sự kiện trong một vòng
 * `for` KHÔNG có `try/catch`: một handler ném lỗi là các listener đứng SAU nó (của
 * feature khác, cùng sự kiện) bị bỏ qua luôn. Đã xảy ra thật: một cache không đúng
 * hình (`list.map` trên object) làm `conversation:activity` ném ⇒ `useReadStateSync`
 * đứng sau không chạy ⇒ badge tab Tin nhắn và danh sách hội thoại đứng im tới khi
 * tải lại app. Lỗi vẫn được báo (Sentry + `logger.warn`), chỉ không được phép kéo
 * các nơi khác chết theo.
 */
export function useSocketEvent<TPayload = unknown>(
  event: string,
  handler: (payload: TPayload) => void,
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (payload: TPayload) => {
      try {
        handlerRef.current(payload);
      } catch (error) {
        logger.warn(`[socket] handler "${event}" lỗi`, error);
        captureException(error, { tags: { socketEvent: event } });
      }
    };
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [event]);
}
