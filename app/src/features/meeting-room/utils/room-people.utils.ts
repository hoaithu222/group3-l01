import type { RoomParticipantDto, RoomRole } from '../api/meeting-room.types';
import type { ConnectionQuality, MeetingMediaParticipant } from '../media/meeting-media.types';

/**
 * "Người trong phòng" cho UI = GHÉP hai nguồn theo `userId` (= `identity` LiveKit): media (SDK — nguồn tức thời cho tên, mic, camera,
 * người nói, giơ tay) ⊕ ảnh chụp server (`GET /meetings/:id/room` + `call:participant-updated` — nguồn cho VAI TRÒ và `mutedByHost`).
 * Danh sách gốc là media: người CHƯA kết nối LiveKit (đang JOINING) thì chưa có ô — đúng với "hình ảnh trực tiếp lấy từ Room cục bộ".
 */
export interface RoomPerson {
  cameraEnabled: boolean;
  connectionQuality: ConnectionQuality;
  handRaisedAt: string | null;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  mutedByHost: boolean;
  name: string;
  role: RoomRole;
  screenShareRef: unknown;
  userId: string;
  videoRef: unknown;
}

const toRole = (role: string | undefined): RoomRole => (role === 'HOST' ? 'HOST' : role === 'CO_HOST' ? 'CO_HOST' : 'MEMBER');

export function mergePeople(media: MeetingMediaParticipant[], server: RoomParticipantDto[]): RoomPerson[] {
  const byId = new Map(server.map((p) => [p.userId, p]));
  return media.map((m) => {
    const s = byId.get(m.identity);
    return {
      cameraEnabled: m.cameraEnabled,
      connectionQuality: m.connectionQuality,
      handRaisedAt: m.handRaisedAt,
      isLocal: m.isLocal,
      isSpeaking: m.isSpeaking,
      micEnabled: m.micEnabled,
      mutedByHost: s?.mutedByHost ?? false,
      name: m.name || s?.name || m.identity,
      role: toRole(s?.role),
      screenShareRef: m.screenShareRef,
      userId: m.identity,
      videoRef: m.videoRef,
    };
  });
}

const isHostLike = (p: RoomPerson): boolean => p.role === 'HOST' || p.role === 'CO_HOST';

/**
 * Thứ tự ô trong lưới (app.md §3.2): ghim → đang nói → giơ tay → camera bật → vào trước (giữ thứ tự gốc). Người MÌNH không được ưu tiên
 * riêng — mình luôn thấy mình ở dải/ô nhỏ nên không cần chiếm ô đầu.
 */
export function sortForStage(people: RoomPerson[], pinnedUserId: string | null): RoomPerson[] {
  const rank = (p: RoomPerson): number =>
    (p.userId === pinnedUserId ? 0 : 8) + (p.isSpeaking ? 0 : 4) + (p.handRaisedAt ? 0 : 2) + (p.cameraEnabled ? 0 : 1);
  return people.map((p, i) => ({ i, p })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

export interface PanelGroups {
  hosts: RoomPerson[];
  others: RoomPerson[];
  /** Đang giơ tay, người giơ SỚM nhất trước (hàng đợi phát biểu). */
  raised: RoomPerson[];
}

/** Nhóm `ParticipantsSheet`: đang giơ tay → chủ trì/đồng chủ trì → còn lại (mỗi người xuất hiện ĐÚNG một nhóm). */
export function groupForPanel(people: RoomPerson[]): PanelGroups {
  const raised = people.filter((p) => p.handRaisedAt).sort((a, b) => (a.handRaisedAt ?? '').localeCompare(b.handRaisedAt ?? ''));
  const rest = people.filter((p) => !p.handRaisedAt);
  return { hosts: rest.filter(isHostLike), others: rest.filter((p) => !isHostLike(p)), raised };
}

export function paginate<T>(items: T[], pageSize: number): T[][] {
  const size = Math.max(1, pageSize);
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/**
 * Video nào cần subscribe: người ở trang đang xem + người ghim + người chia sẻ màn hình (luôn cần) + người nói hiện tại, cắt theo
 * `max` (`MAX_SUBSCRIBED_VIDEOS`) — chia sẻ màn hình và ghim được ưu tiên giữ. Âm thanh không nằm trong danh sách này.
 */
export function videoIdentitiesToSubscribe(
  page: RoomPerson[],
  opts: { max: number; pinnedUserId: string | null; sharerUserId: string | null; speakerUserId: string | null },
): string[] {
  const ordered = [opts.sharerUserId, opts.pinnedUserId, ...page.map((p) => p.userId), opts.speakerUserId].filter((id): id is string => !!id);
  return [...new Set(ordered)].slice(0, Math.max(1, opts.max));
}

/** Số cột lưới theo số ô trên trang: 1 → 1; 2 → 1 (dọc) hoặc 2 (ngang); 3–4 → 2; 5–9 → 3. */
export function gridColumns(count: number, landscape: boolean): number {
  if (count <= 1) return 1;
  if (count === 2) return landscape ? 2 : 1;
  return count <= 4 ? 2 : 3;
}
