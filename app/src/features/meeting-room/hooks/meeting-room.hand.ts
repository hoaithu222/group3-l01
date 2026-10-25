import { showToast } from '@/shared/utils/toast.utils';

import type { HostActionPayload } from '../api/meeting-room.types';
import { getMeetingMedia } from '../media/meeting-media.registry';
import type { MeetingMediaParticipant } from '../media/meeting-media.types';
import {
  meetingRoomApi,
  type HandPending,
  type MeetingRoomState,
} from '../store/meeting-room.store';

/**
 * Giơ/hạ tay của MÌNH (attribute `handRaisedAt` trên LiveKit) — hàm THUẦN ngoài React như các controller khác của phòng.
 *
 * ⚠️ Vì sao không chỉ là một lệnh `setAttributes`: livekit-client 2.22 `requestMetadataUpdate` gửi yêu cầu rồi THĂM DÒ
 * `localParticipant.attributes` (50 ms/lần) tới khi server echo, quá 5 s thì reject `TimeoutError` dù server VẪN có thể áp dụng sau đó.
 * Trong lúc chờ, MỌI snapshot media (người nói/chất lượng mạng đổi liên tục) mang attribute CŨ. ⛔ Trước đây `applyParticipants` đè nút về
 * giá trị cũ (nút nhấp nháy), lần bấm thứ hai lúc đó gửi giá trị NGƯỢC, mạng chậm thì báo "Không giơ tay được" + hoàn lại dù server vẫn nhận.
 *
 * ✅ Ý định đang chờ nằm ở store (`handPending`); `reconcileHand` giữ nó tới khi echo KHỚP — chỉ tính sau khi chính ý định đó đã được gửi
 * (echo của lệnh trước không "khớp nhầm" ý định đang xếp hàng) — hoặc tới hạn `HAND_CONFIRM_MS`. Lệnh gửi NỐI TIẾP (không bao giờ hai
 * `setAttributes` song song); bấm dồn chỉ đổi ý định, ý định bị thay thì không gửi. Quá hạn ⇒ không hoàn lại mù quáng: hiện attribute THẬT.
 */

/** Dài hơn 5 s thăm dò của LiveKit: echo tới trễ (sau `TimeoutError`) vẫn kịp khớp trước khi đối soát lại. */
export const HAND_CONFIRM_MS = 8_000;
/** Echo "đã hạ" của LiveKit hay tới TRƯỚC socket `call:host-action` — trong khoảng này vẫn coi tay mình vừa bị chủ trì hạ (để báo). */
const HOST_DROP_WINDOW_MS = 10_000;

type HandPatch = Pick<MeetingRoomState, 'handPending' | 'handRaisedAt' | 'participants'>;

let lastId = 0;
/** `id` của ý định đã đi (hoặc đang đi) tới server. */
let sentId = 0;
let queue: Promise<void> = Promise.resolve();
/** Lúc tay mình bị hạ TỪ XA (attribute thật về rỗng khi mình không chờ gì) — chỉ chủ trì làm được việc đó. */
let droppedAt = 0;

const isUp = (at: string | null): boolean => at !== null;
const verb = (want: string | null): string => (want ? 'giơ tay' : 'hạ tay');

/** Đặt `handRaisedAt` lên người CỤC BỘ trong danh sách media — ô của mình và danh sách người đổi cùng lúc với nút. */
function withLocalHand(
  list: MeetingMediaParticipant[],
  at: string | null,
): MeetingMediaParticipant[] {
  if (!list.some((p) => p.isLocal && p.handRaisedAt !== at)) return list;
  return list.map((p) => (p.isLocal ? { ...p, handRaisedAt: at } : p));
}

/** Hiện `shown` ở nút + ô của mình; `pending` = ý định mới (hẹn giờ đối soát) hoặc `null` = bỏ hết. */
function show(shown: string | null, pending: HandPending | null): void {
  const participants = withLocalHand(meetingRoomApi.get().participants, shown);
  meetingRoomApi.patch({ handPending: pending, handRaisedAt: shown, participants });
  if (pending) setTimeout(() => expire(pending.id), HAND_CONFIRM_MS);
}

function intent(want: string | null, confirmed: string | null): HandPending {
  lastId += 1;
  return { confirmed, id: lastId, until: Date.now() + HAND_CONFIRM_MS, want };
}

/** Snapshot media mới → giá trị HIỂN THỊ (gọi từ `applyParticipants`): còn chờ thì giữ ý định; echo khớp thì theo attribute thật. */
export function reconcileHand(participants: MeetingMediaParticipant[]): HandPatch {
  const raw = participants.find((p) => p.isLocal)?.handRaisedAt ?? null;
  const { handPending: pending, handRaisedAt: shown } = meetingRoomApi.get();
  if (!pending && raw === null && shown !== null) droppedAt = Date.now();
  if (!pending || (pending.id === sentId && isUp(raw) === isUp(pending.want))) {
    return { handPending: null, handRaisedAt: raw, participants };
  }
  return {
    handPending: raw === pending.confirmed ? pending : { ...pending, confirmed: raw },
    handRaisedAt: pending.want,
    participants: withLocalHand(participants, pending.want),
  };
}

/** Tới hạn mà chưa thấy echo: hiện attribute THẬT gần nhất (server có thể vẫn nhận — echo tới sau tự đúng), nút đổi ngược thì nhắc. */
function expire(id: number): void {
  const pending = meetingRoomApi.get().handPending;
  if (pending?.id !== id) return;
  show(pending.confirmed, null);
  if (isUp(pending.confirmed) !== isUp(pending.want)) {
    showToast('warning', `Mạng chậm nên chưa ${verb(pending.want)} được. Hãy thử lại.`);
  }
}

/** Gửi ý định `id` nếu nó còn MỚI NHẤT. Adapter coi quá hạn của LiveKit là "đã gửi, chờ echo" ⇒ lỗi ở đây = server TỪ CHỐI thật. */
async function send(id: number): Promise<void> {
  const pending = meetingRoomApi.get().handPending;
  if (pending?.id !== id) return;
  sentId = id;
  try {
    await getMeetingMedia().setHandRaised(pending.want);
  } catch {
    const current = meetingRoomApi.get().handPending;
    if (current?.id !== id) return; // đã có ý định mới hơn / chủ trì đã hạ tay — lỗi của lệnh cũ hết nghĩa
    show(current.confirmed, null);
    showToast('error', `Không ${verb(pending.want)} được. Hãy thử lại.`);
  }
}

/** Bấm Giơ/Hạ tay: đổi NGAY (lạc quan) rồi xếp lệnh gửi. Giờ giơ tay theo GIỜ SERVER — hàng đợi phát biểu so trên giờ server. */
export function toggleHand(): Promise<void> {
  const { handPending, handRaisedAt, serverOffsetMs } = meetingRoomApi.get();
  const want = handRaisedAt ? null : new Date(Date.now() + serverOffsetMs).toISOString();
  const next = intent(want, handPending ? handPending.confirmed : handRaisedAt);
  show(want, next);
  queue = queue.then(() => send(next.id));
  return queue;
}

/**
 * Chủ trì hạ tay mình: BE ĐÃ xoá attribute ⇒ hiện "đã hạ" NGAY, thay ý định đang chờ bằng ý định "hạ" coi như đã gửi (echo giơ tay cũ tới
 * muộn không bật lại nút) và gửi thêm lệnh xoá idempotent — phòng khi lệnh giơ tay của mình tới server SAU lệnh của chủ trì.
 * Trả `true` nếu tay mình đang giơ, hoặc vừa bị hạ từ xa (echo LiveKit tới trước socket).
 */
export function lowerHandByHost(): boolean {
  const { handPending, handRaisedAt } = meetingRoomApi.get();
  const justDropped = Date.now() - droppedAt < HOST_DROP_WINDOW_MS;
  droppedAt = 0;
  if (handRaisedAt === null && handPending === null) return justDropped;
  const lowered = intent(null, null);
  sentId = lowered.id;
  show(null, lowered);
  void getMeetingMedia()
    .setHandRaised(null)
    .catch(() => undefined);
  return handRaisedAt !== null || justDropped;
}

/**
 * `call:host-action` loại hạ tay: `LOWER_ALL_HANDS` (cả phòng) · `HAND_LOWERED` (chỉ tới người bị hạ). Báo CHỈ khi tay mình đang/vừa giơ
 * và người bấm không phải mình (chủ trì tự bấm đã có toast của thao tác). `true` = đúng loại hạ tay (đã xử lý xong).
 */
export function applyHostHandAction(
  payload: Pick<HostActionPayload, 'byUserId' | 'targetUserId' | 'type'>,
  meId: string,
): boolean {
  const all = payload.type === 'LOWER_ALL_HANDS';
  if (!all && payload.type !== 'HAND_LOWERED') return false;
  if ((all || payload.targetUserId === meId) && lowerHandByHost() && payload.byUserId !== meId) {
    showToast('info', all ? 'Chủ trì đã hạ tay của mọi người.' : 'Chủ trì đã hạ tay của bạn.');
  }
  return true;
}
