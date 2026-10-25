import { useEffect, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import type { RoomRole } from '../api/meeting-room.types';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { raisedHandOrder } from '../utils/hand-queue.utils';
import type { RoomPerson } from '../utils/room-people.utils';

/** Gom các bàn tay giơ gần nhau thành MỘT thông báo ("Lan và 2 người khác…") thay vì một chuỗi toast dồn dập. */
export const HAND_ALERT_WINDOW_MS = 1_200;

/** Chữ của thông báo cho một lô tay mới giơ — người giơ SỚM nhất đứng tên. */
export function raisedHandAlertText(names: readonly string[]): string {
  const [first = 'Một người', ...rest] = names;
  return rest.length > 0
    ? `${first} và ${String(rest.length)} người khác đang giơ tay`
    : `${first} đang giơ tay`;
}

/**
 * Trạng thái của MỘT lần gắn hook (lớp thường, không phải state React — đổi nó không cần vẽ lại). `since` = mốc gieo theo GIỜ SERVER:
 * chỉ tay có `handRaisedAt` ≥ mốc mới đáng báo.
 */
class RaisedHandAlerter {
  private batch = new Set<string>();
  private latest: readonly RoomPerson[] = [];
  private readonly seen = new Set<string>();
  private since: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(serverNowMs: number): void {
    this.since = serverNowMs;
  }

  stop(): void {
    this.since = null;
    this.batch.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  observe(people: readonly RoomPerson[]): void {
    this.latest = people;
    const up = new Set<string>();
    for (const person of people) {
      if (!person.handRaisedAt || person.isLocal) continue;
      const key = `${person.userId}@${person.handRaisedAt}`;
      up.add(key);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (this.since !== null && Date.parse(person.handRaisedAt) >= this.since)
        this.batch.add(person.userId);
    }
    // Tay đã hạ thì quên — giơ lại (mốc mới) là một lần giơ tay mới.
    for (const key of this.seen) if (!up.has(key)) this.seen.delete(key);
    if (this.batch.size > 0 && this.timer === null)
      this.timer = setTimeout(() => this.flush(), HAND_ALERT_WINDOW_MS);
  }

  private flush(): void {
    this.timer = null;
    const queued = this.batch;
    this.batch = new Set();
    const order = raisedHandOrder(this.latest);
    // Ai đã hạ tay/rời phòng trong lúc gom thì bỏ — báo một bàn tay không còn giơ là báo sai.
    const names = this.latest
      .filter((person) => queued.has(person.userId) && order.has(person.userId))
      .sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0))
      .map((person) => person.name);
    if (names.length > 0) showToast('info', raisedHandAlertText(names));
  }
}

/**
 * Chủ trì/đồng chủ trì được báo (toast) khi NGƯỜI KHÁC giơ tay — như Meet/Zoom: lúc đang nói/trình bày không ai mở danh sách người để dò.
 *
 * ⛔ Không báo: tay của chính mình; tay ĐÃ giơ từ trước lúc mình vào phòng / nối lại xong / được cấp quyền (gieo im lặng). So bằng
 * `handRaisedAt` (giờ server) với mốc gieo chứ không theo thứ tự snapshot tới: sau khi nối lại, người trong phòng tới LẺ TẺ nhiều giây —
 * đếm "mới thấy = mới giơ" là báo nhầm cả loạt tay giơ từ trước.
 */
export function useRaisedHandAlerts(people: readonly RoomPerson[], role: RoomRole): void {
  const inRoom = useMeetingRoomStore((state) => state.phase === 'IN_ROOM');
  const active = inRoom && (role === 'HOST' || role === 'CO_HOST');
  const [alerter] = useState(() => new RaisedHandAlerter());

  useEffect(() => {
    if (!active) return undefined;
    alerter.start(Date.now() + meetingRoomApi.get().serverOffsetMs);
    return () => alerter.stop();
  }, [active, alerter]);

  useEffect(() => alerter.observe(people), [alerter, people]);
}
