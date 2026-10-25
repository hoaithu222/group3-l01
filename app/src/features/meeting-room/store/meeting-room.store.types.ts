import type { CallMediaConnectionState } from '@/core/media/call-media.types';

import type {
  BlockedCode,
  JoinedResult,
  LobbyEntry,
  MeetingBrief,
  PublishPermissions,
  RoomRecordingState,
  RoomRole,
} from '../api/meeting-room.types';
import type { MeetingMediaParticipant } from '../media/meeting-media.types';

/**
 * Kiểu state phiên phòng họp (app.md p2-05 §5) — MỘT phòng tại một thời điểm, KHÔNG persist. Tách khỏi `meeting-room.store.ts` để file
 * store chỉ còn hành động (≤ 150 dòng); component chỉ IMPORT KIỂU từ đây (hoặc qua `meeting-room.store`, có re-export).
 */

export type RoomPhase =
  | 'BLOCKED'
  | 'CONNECTING'
  | 'ENDED'
  | 'IN_LOBBY'
  | 'IN_ROOM'
  | 'PREJOIN'
  | 'RECONNECTING'
  | 'REMOVED'
  | 'WAITING_FOR_HOST';

export type RoomSheet = 'CHAT' | 'MORE' | 'NONE' | 'PARTICIPANTS' | 'REACTIONS' | 'RECORDING';
export type StageLayout = 'GRID' | 'SPEAKER';

export interface PreJoinPrefs {
  cam: boolean;
  displayName: string;
  facing: 'back' | 'front';
  /** "Tham gia chỉ để nghe" — không xin quyền mic/camera. */
  listenOnly: boolean;
  mic: boolean;
}

export interface FloatingReaction {
  at: number;
  emoji: string;
  id: string;
  identity: string;
}

/** Vé kết nối LiveKit cho lần nối/nối lại (token hết hạn nhanh — 600 s). */
export interface LiveKitTicket {
  expiresAt: number;
  room: string;
  token: string;
  url: string;
}

/**
 * Ghi hình của phòng THEO NGƯỜI XEM (p2-06): trạng thái server (`RoomRecordingState` — từ `JoinResult`/ảnh chụp phòng/`call:recording`) + tiến
 * độ đồng ý (chỉ SỐ) + lựa chọn "Chỉ xem và nghe" của mình khi đang ghi (mic/camera hiện khoá kèm nhãn "Cần đồng ý ghi hình").
 */
export interface RoomRecording extends RoomRecordingState {
  counts?: { accepted: number; declined: number; pending: number };
  declined?: boolean;
}

/** Hộp thoại đồng ý đang mở: `REQUEST` (chủ trì vừa hỏi ý kiến), `LATE` (đang ghi mà mình chưa đồng ý), `NONE`. */
export type ConsentPrompt = 'LATE' | 'NONE' | 'REQUEST';

/**
 * Giơ/hạ tay của MÌNH đang chờ LiveKit xác nhận (`hooks/meeting-room.hand.ts`). ⚠️ `setAttributes` (livekit-client 2.22) chỉ đổi
 * `localParticipant.attributes` khi SERVER echo về ⇒ trong lúc chờ, mọi snapshot media vẫn mang attribute CŨ; giữ ý định ở đây để snapshot
 * không bật nút ngược lại. `want` = giá trị vừa bấm · `confirmed` = attribute THẬT gần nhất (hoàn lại khi server từ chối/quá hạn) ·
 * `until` = hạn chờ (ms, đồng hồ máy) · `id` tăng sau mỗi lần bấm (bấm dồn: chỉ ý định MỚI NHẤT được gửi tiếp).
 */
export interface HandPending {
  confirmed: string | null;
  id: number;
  until: number;
  want: string | null;
}

export interface MeetingRoomState {
  blockedCode: BlockedCode | null;
  brief: MeetingBrief | null;
  /** Đang gọi API vào phòng/bắt đầu — khoá nút, nhãn `loading`. */
  busy: boolean;
  /** `CALL_004`: đang ở cuộc gọi/họp khác — hộp thoại "Chuyển sang cuộc họp này?" (gọi lại với `force`). */
  busyConflict: { sameDevice: boolean } | null;
  callId: string | null;
  camDenied: boolean;
  camOn: boolean;
  /** Tin nhắn mới trong nhóm chat họp lúc sheet Chat đóng — badge ở thanh điều khiển. */
  chatUnread: number;
  closingAt: string | null;
  connection: CallMediaConnectionState;
  /** p2-06: hộp thoại đồng ý ghi hình đang mở. */
  consentPrompt: ConsentPrompt;
  /** Đã có nhóm chat họp (server trả lúc vào hoặc host vừa tạo). */
  conversationId: string | null;
  endedDurationSec: number | null;
  endedReason: string | null;
  /** Lý do lỗi kết nối/mạng ở pre-join (`Alert` + Thử lại) — không phải mã nghiệp vụ. */
  error: string | null;
  /** Ý định giơ/hạ tay chưa được LiveKit xác nhận — `null` = `handRaisedAt` đã là attribute thật. */
  handPending: HandPending | null;
  /** Tay của MÌNH như người dùng thấy: ý định đang chờ (nếu có), không thì attribute `handRaisedAt` thật trên LiveKit. */
  handRaisedAt: string | null;
  layout: StageLayout;
  lobby: LobbyEntry[];
  lockedAt: string | null;
  meetingId: string | null;
  micDenied: boolean;
  micOn: boolean;
  /** Đã bấm "Thu nhỏ" — `MeetingMiniBar` hiện thay màn phòng. */
  minimized: boolean;
  page: number;
  participants: MeetingMediaParticipant[];
  phase: RoomPhase;
  pinnedUserId: string | null;
  preJoin: PreJoinPrefs;
  publish: PublishPermissions;
  reactions: FloatingReaction[];
  /** p2-06: `null` = không ghi và không có yêu cầu đồng ý. Chỉ báo "Đang ghi hình" LUÔN theo trường này (kể cả sau reconnect — RR-19). */
  recording: RoomRecording | null;
  role: RoomRole | null;
  screenSharing: boolean;
  /** Chênh lệch `giờ server − Date.now()` (ms) lúc nhận `serverNow` gần nhất — đồng hồ họp đúng giờ server. */
  serverOffsetMs: number;
  sheet: RoomSheet;
  speakerOn: boolean;
  /** Lúc bắt đầu PHIÊN theo giờ server (ISO) — đồng hồ thời lượng ở header. */
  startedAt: string | null;
  ticket: LiveKitTicket | null;
  /** `WAITING_FOR_HOST`: giờ mở phòng/bắt đầu (ISO) để đếm ngược. */
  waiting: { joinOpensAt: string; startAt: string } | null;
}

export interface MeetingRoomActions {
  addReaction: (reaction: FloatingReaction) => void;
  /** Ghi các trường của phiên vừa `JOINED`. */
  applyJoined: (joined: JoinedResult, offsetMs: number) => void;
  dropReaction: (id: string) => void;
  patch: (partial: Partial<MeetingRoomState>) => void;
  reset: () => void;
}
