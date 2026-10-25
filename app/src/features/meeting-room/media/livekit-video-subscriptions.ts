import type * as LiveKitSdk from 'livekit-client';

import type { LiveKitModule } from '@/core/media/livekit-loader';

/** Video vừa rời danh sách cần xem được GIỮ subscribe thêm ít nhất ngần này rồi mới bỏ. */
export const VIDEO_UNSUBSCRIBE_DELAY_MS = 3000;

interface RoomRef {
  room: LiveKitSdk.Room | null;
  sdk: LiveKitModule | null;
}

/**
 * Chỉ subscribe VIDEO (camera/chia sẻ) của những người đang hiện — trang lưới + ghim + người chia sẻ + người nói (`useGridPaging`); âm thanh
 * LUÔN nhận của mọi người (không đụng tới).
 *
 * ✅ Subscribe NGAY nhưng BỎ subscribe TRỄ (≥ `VIDEO_UNSUBSCRIBE_DELAY_MS`): người nói đổi liên tục và lưới xếp "đang nói" lên trước nên một người
 *    có thể ra/vào trang nhiều lần mỗi giây; vuốt qua lại giữa hai trang cũng vậy. Mỗi lần subscribe lại = một vòng đàm phán + chờ khung hình khoá
 *    (ô nháy avatar, máy tầm trung giật). Trong lúc chờ bỏ, track không còn ô nào vẽ nên `adaptiveStream` đã bảo SFU tạm ngừng gửi (~0 băng thông).
 * ✅ Quyết định theo `isDesired` (ý muốn đã gửi) chứ không theo `isSubscribed` (track đã về): track đang chờ về không bị gửi lệnh subscribe lặp
 *    lại mỗi lần áp — tránh bão lệnh khi đổi trang.
 * `wanted = null` (chưa có danh sách — vừa vào phòng, lưới chưa vẽ) ⇒ không đụng gì: track mới mặc định được nhận (`autoSubscribe`).
 */
export class VideoSubscriptions {
  private readonly leftAt = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wanted: ReadonlySet<string> | null = null;

  constructor(private readonly context: () => RoomRef) {}

  set(identities: readonly string[]): void {
    this.wanted = new Set(identities);
    this.apply();
  }

  /** Áp lại (cũng gọi khi có người/track mới): subscribe ngay cái cần; cái thừa hẹn bỏ khi đã quá hạn giữ. */
  apply(): void {
    if (!this.sync() || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.apply();
    }, VIDEO_UNSUBSCRIBE_DELAY_MS);
  }

  /**
   * Bỏ phòng: huỷ hẹn giờ. `forget = false` (dựng lại phòng khi nối lại) GIỮ danh sách — lưới không đổi thì `useGridPaging` không gọi lại
   * `set`, quên đi là phòng mới nhận video của TẤT CẢ mọi người (lỗi cũ sau mỗi lần rớt mạng). `forget = true` (rời hẳn): phòng sau "nhận hết".
   */
  reset(forget = true): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.leftAt.clear();
    if (forget) this.wanted = null;
  }

  /** Trả `true` khi còn video thừa đang được GIỮ (chưa tới hạn bỏ). */
  private sync(): boolean {
    const { room, sdk } = this.context();
    const wanted = this.wanted;
    if (!room || !sdk || !wanted) return false;
    const now = Date.now();
    let lingering = false;
    for (const participant of room.remoteParticipants.values()) {
      const want = wanted.has(participant.identity);
      if (want) this.leftAt.delete(participant.identity);
      for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== sdk.Track.Kind.Video) continue;
        if (want) {
          if (!publication.isDesired) publication.setSubscribed(true);
        } else if (publication.isDesired) {
          const since = this.leftAt.get(participant.identity) ?? now;
          this.leftAt.set(participant.identity, since);
          if (now - since >= VIDEO_UNSUBSCRIBE_DELAY_MS) publication.setSubscribed(false);
          else lingering = true;
        }
      }
    }
    return lingering;
  }
}
