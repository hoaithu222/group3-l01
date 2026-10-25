import { meetingRoomService } from '../api/meeting-room.service';
import { RECONNECT_GRACE_MS, TOKEN_RENEW_MARGIN_MS } from '../constants/meeting-room.constants';
import { meetingRoomApi } from '../store/meeting-room.store';

/**
 * Trạng thái NGOÀI React của phiên phòng họp (controller không phải hook — thu nhỏ/rời màn không được làm rớt kết nối): "thế hệ" kết
 * nối (huỷ lượt chờ cũ khi đã rời/đổi phòng), hàm huỷ đăng ký media, bộ đếm giờ mất mạng và làm mới token. Tách riêng để
 * `session`/`teardown`/`media-events` dùng chung mà không import vòng nhau.
 */

/** Sau lần làm mới token lỗi, thử lại không dày hơn ngần này (không đập server khi mất mạng). */
const MIN_RENEW_DELAY_MS = 30_000;
/** Trần đặt lịch: `setTimeout` quá ~24,8 ngày bị Node/Hermes hiểu thành 1 ms (vòng lặp vô hạn) — và đồng hồ máy lệch nhiều thì hạn token không đáng tin. */
const MAX_RENEW_DELAY_MS = 10 * 60_000;

let generation = 0;
let unbindMedia: (() => void) | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let renewTimer: ReturnType<typeof setTimeout> | null = null;
let reconnecting = false;

export const currentGeneration = (): number => generation;

export function nextGeneration(): number {
  generation += 1;
  return generation;
}

/** Đăng ký/thay/gỡ (`null`) hàm huỷ đăng ký sự kiện media — mỗi lần chỉ MỘT người nghe của phiên. */
export function setMediaBinding(unbind: (() => void) | null): void {
  unbindMedia?.();
  unbindMedia = unbind;
}

export const isReconnecting = (): boolean => reconnecting;
export const setReconnecting = (value: boolean): void => {
  reconnecting = value;
};

export function clearGrace(): void {
  if (graceTimer) clearTimeout(graceTimer);
  graceTimer = null;
}

/** Mất kết nối quá `RECONNECT_GRACE_MS` thì thôi tự nối lại (app.md §3.1) — `onExpire` đưa về pre-join có nút "Thử lại". */
export function startGrace(onExpire: () => void): void {
  clearGrace();
  graceTimer = setTimeout(onExpire, RECONNECT_GRACE_MS);
}

function clearTokenRenew(): void {
  if (renewTimer) clearTimeout(renewTimer);
  renewTimer = null;
}

export function clearTimers(): void {
  clearGrace();
  clearTokenRenew();
  reconnecting = false;
}

/**
 * `POST /calls/:id/token` — token mới cho lần nối lại; lỗi thì GIỮ token cũ (caller vẫn thử được). Trả `true` khi đổi được token.
 * ⛔ Chỉ ghi khi phiên VẪN là phiên đã xin (cùng `callId`, còn vé): rời phòng trong lúc chờ mạng thì store đã dọn — ghi vé vào là hồi sinh phiên đã bỏ.
 */
export async function renewTicket(): Promise<boolean> {
  const { callId, ticket } = meetingRoomApi.get();
  if (!callId || !ticket) return false;
  try {
    const fresh = await meetingRoomService.renewToken(callId);
    const now = meetingRoomApi.get();
    if (now.callId !== callId || !now.ticket) return false;
    meetingRoomApi.patch({
      ticket: { expiresAt: Date.parse(fresh.expiresAt), room: ticket.room, token: fresh.token, url: fresh.livekitUrl },
    });
    return true;
  } catch {
    return false;
  }
}

/** Làm mới token trước hạn `TOKEN_RENEW_MARGIN_MS` (app.md §4.1 bước 6); tự đặt lịch lại sau mỗi lần. */
export function scheduleTokenRenew(): void {
  clearTokenRenew();
  const ticket = meetingRoomApi.get().ticket;
  if (!ticket) return;
  const due = ticket.expiresAt - Date.now() - TOKEN_RENEW_MARGIN_MS;
  const delay = Math.min(MAX_RENEW_DELAY_MS, Math.max(MIN_RENEW_DELAY_MS, due));
  renewTimer = setTimeout(() => {
    void renewTicket().then(scheduleTokenRenew);
  }, delay);
}
