import type { AuthUser } from "../../../core/types/express";
import type { IMediaServer, MediaTrackSource } from "../../../infrastructure/media";
import type { PomodoroConfig, PomodoroEndReason, PomodoroPublish } from "../entities/pomodoro.interface";
import type { IPomodoroRepository } from "../repositories/pomodoro.repository.interface";
import type { IOutboxPort, ITxRunner, TxHandle } from "../repositories/tx";
import type { PomodoroCommandStore } from "./pomodoro-command.store";

/** Phiên gọi (`Call scopeType CHANNEL, mode ROOM`) — chỉ những trường Pomodoro cần (tập con của `CallEntity` của `calls`). */
export interface PomodoroCall {
  id: string;
  livekitRoom: string;
  status: "RINGING" | "ACTIVE" | "ENDED";
  endReason: string | null;
  hostId: string | null;
  version: number;
  startedAt: Date;
}

export interface PomodoroParticipant {
  userId: string;
  role: string;
  state: string;
  publishPermissions: PomodoroPublish;
  mutedByHost: boolean;
  respondedDeviceId: string | null;
  firstJoinedAt: Date | null;
  version: number;
}

/** Trạng thái người ĐANG ở trong phòng (đã/đang kết nối) — `JOINING` tính là đang vào. */
export const PRESENT_STATES: readonly string[] = ["JOINING", "CONNECTED", "RECONNECTING"];
export const isPresentState = (state: string): boolean => PRESENT_STATES.includes(state);

export type ActiveLock = { acquired: true } | { acquired: false; existing: string };

/** Hai tiến trình cùng tạo phòng của kênh (`Call.activeKey` trùng, P2002): bên thua thấy phòng của bên thắng. */
export class RoomCallConflictError extends Error {
  constructor() {
    super("Pomodoro call unique conflict");
    this.name = "RoomCallConflictError";
  }
}

export interface CreateRoomCallInput {
  callId: string;
  channelId: string;
  workspaceId: string;
  livekitRoom: string;
  initiatorId: string;
  hostId: string;
}

export interface EnterRequest {
  callId: string;
  userId: string;
  deviceId: string;
  role: "HOST" | "MEMBER";
  publish: PomodoroPublish;
  maxParticipants: number;
  /** Cùng phiên, thiết bị khác đang kết nối: `false` → `OTHER_DEVICE`; `true` → đá thiết bị cũ. */
  force: boolean;
}

export type EnterResult = { kind: "OK"; participant: PomodoroParticipant; rejoined: boolean } | { kind: "ENDED" | "BLOCKED" | "FULL" | "OTHER_DEVICE" };

/**
 * Cổng của `pomodoro` sang lõi cuộc gọi (p2-01/p2-03) — module `pomodoro` KHÔNG import `calls` ngoài file adapter duy nhất
 * `adapters/calls-room.adapter.ts` (mẫu `MeetingCallPort` của p2-05). `Call`/`CallParticipant`, khoá nóng `call:*`, kết thúc phiên (`endCall`)
 * và cấp token do `calls` sở hữu; Pomodoro chỉ GỌI LẠI, không sửa lõi.
 */
export interface PomodoroCallPort {
  acquireActive(channelId: string, callId: string): Promise<ActiveLock>;
  promoteActive(channelId: string, callId: string): Promise<boolean>;
  releaseActive(channelId: string, callId: string): Promise<boolean>;
  /** Tạo `Call ACTIVE` (chưa có participant — người tạo vào bằng `enter`). Ném `RoomCallConflictError` khi `activeKey` trùng. */
  createRoomCall(tx: TxHandle, input: CreateRoomCallInput): Promise<PomodoroCall>;
  findCall(callId: string): Promise<PomodoroCall | null>;
  /** Như `findCall` nhưng chờ ngắn (≤ 0,5 s) khi khoá `call:active` đã có mà hàng `Call` của người tạo chưa commit. */
  awaitCall(callId: string): Promise<PomodoroCall | null>;
  /** Phòng đang mở (chưa ENDED) của kênh. */
  findOpenCall(channelId: string): Promise<PomodoroCall | null>;
  listParticipants(callId: string): Promise<PomodoroParticipant[]>;
  findParticipant(callId: string, userId: string): Promise<PomodoroParticipant | null>;
  /** Vào phòng NGUYÊN TỬ dưới `call:lock`: kiểm bị mời ra/đầy/thiết bị khác rồi tạo hoặc cập nhật participant `JOINING`. */
  enter(req: EnterRequest): Promise<EnterResult>;
  /** `call:busy:<user>` — đang ở cuộc gọi/phòng khác: `force = false` → `CALL_004`; `force = true` → rời phòng cũ. */
  claimBusy(user: AuthUser, callId: string, force: boolean): Promise<void>;
  releaseBusy(userId: string, callId: string): Promise<void>;
  /** Cấp token LiveKit theo quyền publish LƯU ở participant (`CallTokenService`, kiểm quyền còn hiệu lực). */
  issueToken(user: AuthUser, callId: string): Promise<{ token: string; livekitUrl: string; expiresAt: string }>;
  /** `CallDto` (như `POST /calls/:id/join`) để app dùng lại đường kết nối media của phòng thoại. */
  buildCallDto(user: AuthUser, callId: string): Promise<unknown>;
  /** Kết thúc phòng (điểm DUY NHẤT — `CallEndService.endCall`). */
  endCall(callId: string, reason: PomodoroEndReason, actorId: string | null): Promise<void>;
  /** Ghi `publishPermissions` (CAS participant + tín hiệu `participant-changed`); `null` khi lệch/không còn trong phòng. */
  setPublish(callId: string, userId: string, publish: PomodoroPublish): Promise<PomodoroParticipant | null>;
  /** Nguồn publish cơ sở của lõi (`CallRoomPermissions.sources`: đã tính `mutedByHost`). */
  baseSources(p: PomodoroParticipant): MediaTrackSource[];
}

export type ChannelTypeValue = "TEXT" | "VOICE" | "POMODORO";

export interface PomodoroChannelInfo {
  id: string;
  workspaceId: string;
  name: string;
  type: ChannelTypeValue;
  status: "ACTIVE" | "ARCHIVED";
  workspaceActive: boolean;
  /** `Channel.settings.pomodoro` đã chuẩn hoá (thiếu → mặc định nền tảng). */
  defaultConfig: PomodoroConfig;
}

/** Đọc CHỈ-ĐỌC dữ kiện kênh/người dùng của module khác (cùng cách `call-scope.reader.ts`); ghi duy nhất khoá `settings.pomodoro`. */
export interface IPomodoroChannelReader {
  get(channelId: string): Promise<PomodoroChannelInfo | null>;
  names(channelIds: string[]): Promise<Map<string, string>>;
  userNames(userIds: string[]): Promise<Map<string, string>>;
  saveDefaultConfig(channelId: string, config: PomodoroConfig): Promise<void>;
}

/** Quyền theo dữ liệu qua `PermissionService` (không tự đọc membership). `read` đã kiểm ở middleware route. */
export interface IPomodoroAccess {
  canManage(user: AuthUser, channelId: string): Promise<boolean>;
  canRead(user: AuthUser, channelId: string): Promise<boolean>;
}

/** Việc nền KHÔNG bắt buộc bền (quét bù bằng cron `pomodoro.reconcile`). */
export interface IPomodoroJobs {
  /** Đồng bộ `hostUserId` với `Call.hostId` sau `delayMs` (failover chủ phòng của `calls` chạy sau ~30 s). */
  scheduleHostSync(sessionId: string, delayMs: number): Promise<void>;
}

/** Phát `pomodoro:updated` tới `ch:{channelId}` — API phát trực tiếp; worker (chưa có `getIO()`) nhờ tiến trình API phát. */
export interface IPomodoroBroadcaster {
  broadcast(sessionId: string): Promise<void>;
}

export interface PomodoroDeps {
  repo: IPomodoroRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  calls: PomodoroCallPort;
  channels: IPomodoroChannelReader;
  access: IPomodoroAccess;
  commands: PomodoroCommandStore;
  jobs: IPomodoroJobs;
  broadcaster: IPomodoroBroadcaster;
  /** Máy chủ media — lấy lười để test đổi `setMediaServerForTests` sau khi dựng container. */
  media: () => IMediaServer;
  now: () => Date;
}
