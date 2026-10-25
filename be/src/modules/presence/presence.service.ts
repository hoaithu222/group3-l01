/**
 * @file presence.service.ts
 * @description Tính trạng thái hiện diện (ONLINE/IDLE/DND/OFFLINE/HIDDEN) —
 * be.md p0-03 §5.4/README §2. Chỉ Redis (be.md §4 "Không có model"): lease
 * theo thiết bị, cờ DND, trạng thái đã phát gần nhất (chống phát trùng) +
 * throttle phát (chống xả bão khi 1 user đổi trạng thái liên tục).
 *
 * Module flat (không domain model Mongo riêng) — pattern giống
 * `modules/admin-overview`, `modules/admin-jobs`.
 */
import { redis } from "../../infrastructure/redis";
import { getUserStatusCached } from "../../core/permission/user-status";
import { LIMITS } from "../../core/constants/limits";
import { ROOM } from "../../infrastructure/socket/socket.rooms";
import { emitToRoom } from "../../infrastructure/socket/socket.emit";
import { presenceUpdatesTotal } from "../../infrastructure/metrics";
import { logger } from "../../infrastructure/logger";

export type PresenceState = "ONLINE" | "IDLE" | "DND" | "OFFLINE" | "HIDDEN";
/** Trạng thái "thật" tính từ lease/DND/active — trước khi áp `showPresence`. */
type RawPresenceState = Exclude<PresenceState, "HIDDEN">;

export interface PresenceEntry {
  state: PresenceState;
  /** P0 KHÔNG ghi Mongo mỗi nhịp (be.md §2 Prisma) — luôn `undefined` cho tới khi P1 ghi `User.lastSeenAt` lúc OFFLINE qua job reap. */
  lastSeenAt?: string;
}

// ─── Audience registry — giống registerScopeResolver (p0-02) ────────────────

type AudienceResolver = (userId: string) => Promise<string[]>;
let audienceResolver: AudienceResolver | null = null;

/**
 * Module Phase 1+ đăng ký cách tính "phát `presence:updated` của user này vào
 * những room nào" (README §2 "Audience presence" — vd `ws:{id}` của workspace
 * chung ACTIVE + `user:{peerId}` của hội thoại DIRECT). Chưa đăng ký (Phase 0)
 * → audience rỗng, KHÔNG phát đi đâu (mặc định đóng, không `io.emit` toàn cục).
 */
export function registerPresenceAudience(resolver: AudienceResolver): void {
  audienceResolver = resolver;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearPresenceAudience(): void {
  audienceResolver = null;
}

// ─── "Room tự động join lúc connect" registry (be.md §5.1) ───────────────────

type JoinRoomsResolver = (userId: string) => Promise<string[]>;
let joinRoomsResolver: JoinRoomsResolver | null = null;

/**
 * Module Phase 1+ đăng ký cách tính "user này lúc connect nên tự join thêm
 * những room nào ngoài `user:{id}`" (be.md §5.1 — Phase 1 trả `ws:{id}` của
 * mọi workspace ACTIVE, tránh client phải tự `room:join` từng cái sau khi
 * kết nối). Chưa đăng ký (Phase 0) → không join thêm room nào — hành vi hiện
 * tại (chỉ `user:{id}`) giữ nguyên cho tới khi có module workspace thật.
 */
export function registerPresenceJoinRooms(resolver: JoinRoomsResolver): void {
  joinRoomsResolver = resolver;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearPresenceJoinRooms(): void {
  joinRoomsResolver = null;
}

/** Gọi trong `socket.server.ts` ngay sau khi join `user:{id}` lúc connect. */
export async function presenceJoinRooms(userId: string): Promise<string[]> {
  if (!joinRoomsResolver) return [];
  try {
    return await joinRoomsResolver(userId);
  } catch (err) {
    logger.warn("[presence] presenceJoinRooms resolver lỗi, bỏ qua (chỉ còn user:{id})", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Bộ lọc chặn người dùng (p1-08) — cùng khuôn `registerPresenceAudience` ──

type HiddenResolver = (userId: string) => Promise<ReadonlySet<string>>;
let hiddenResolver: HiddenResolver | null = null;

/**
 * `modules/blocks` (p1-08) đăng ký "những userId KHÔNG được thấy/không thấy presence của `userId`"
 * (cả hai hướng chặn — README p1-08 §2 "Presence/typing"). Chưa đăng ký → không lọc (mặc định như trước p1-08).
 * Dùng registry thay vì import `blocks` trực tiếp để presence không phụ thuộc DB khi test đơn vị.
 */
export function registerPresenceHiddenResolver(resolver: HiddenResolver): void {
  hiddenResolver = resolver;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearPresenceHiddenResolver(): void {
  hiddenResolver = null;
}

/**
 * Registry nào đã đăng ký — CHỈ đọc, dùng cho test parity API ↔ worker (`src/tests/worker-registries.parity.test.ts`): worker riêng
 * (`presence.reap` phát `presence:updated`) phải có cùng audience/bộ lọc chặn với API.
 */
export function presenceRegistrations(): { audience: boolean; joinRooms: boolean; hiddenResolver: boolean } {
  return { audience: audienceResolver !== null, joinRooms: joinRoomsResolver !== null, hiddenResolver: hiddenResolver !== null };
}

/** Lỗi resolver → fail-open (presence là dữ liệu best-effort, không đáng chặn cả lượt phát) nhưng có log cảnh báo. */
async function hiddenFrom(userId: string): Promise<ReadonlySet<string>> {
  if (!hiddenResolver) return new Set();
  try {
    return await hiddenResolver(userId);
  } catch (err) {
    logger.warn("[presence] hidden resolver (chặn người dùng) lỗi — bỏ qua bộ lọc lượt này", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Set();
  }
}

async function audienceRooms(userId: string): Promise<string[]> {
  if (!audienceResolver) return [];
  try {
    return await audienceResolver(userId);
  } catch (err) {
    logger.warn("[presence] audience resolver lỗi, bỏ qua lượt phát này", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Nghe nhịp "đang tương tác" (p7-03 burnout radar) — cùng khuôn `registerPresenceAudience` ──────────

type ActiveBeatListener = (userId: string, at: Date) => Promise<void> | void;
const activeBeatListeners = new Map<string, ActiveBeatListener>();

/**
 * Module khác (burnout) đăng ký "khi user gửi nhịp `active = true` thì báo cho tôi" mà KHÔNG phải sửa `heartbeat` mỗi lần. Chỉ chạy ở tiến trình API (nơi nhận `presence:heartbeat`). Listener chạy NỀN, lỗi bị nuốt
 * (có log) — không bao giờ làm chậm hay hỏng nhịp hiện diện. Cố ý KHÔNG nằm trong `presenceRegistrations()` (worker không nhận nhịp nên không cần — test parity API ↔ worker).
 */
export function registerPresenceActiveListener(name: string, listener: ActiveBeatListener): void {
  activeBeatListeners.set(name, listener);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearPresenceActiveListeners(): void {
  activeBeatListeners.clear();
}

function notifyActiveBeat(userId: string, at: Date): void {
  for (const [name, listener] of activeBeatListeners) {
    void Promise.resolve()
      .then(() => listener(userId, at))
      .catch((err: unknown) => {
        logger.warn("[presence] listener nhịp active lỗi, bỏ qua", { listener: name, error: err instanceof Error ? err.message : String(err) });
      });
  }
}

// ─── Redis keys (be.md §4) ────────────────────────────────────────────────

const DEV_TTL_SECONDS = 120;
const STATE_TTL_SECONDS = 120;

function devKey(userId: string): string {
  return `presence:dev:${userId}`;
}
function activeKey(userId: string): string {
  return `presence:active:${userId}`;
}
function dndKey(userId: string): string {
  return `presence:dnd:${userId}`;
}
function stateKey(userId: string): string {
  return `presence:state:${userId}`;
}
function throttleKey(userId: string): string {
  return `presence:throttle:${userId}`;
}
const STATE_KEY_PREFIX = "presence:state:";

// ─── Ghi lease / DND ──────────────────────────────────────────────────────

/** `presence:heartbeat` (be.md §5.4) — làm mới lease thiết bị, đánh dấu "đang tương tác" nếu `active`, rồi tính lại + phát nếu đổi. */
export async function heartbeat(userId: string, deviceId: string, active: boolean): Promise<void> {
  const nowMs = Date.now();
  await redis.hset(devKey(userId), deviceId, String(nowMs));
  await redis.expire(devKey(userId), DEV_TTL_SECONDS);
  if (active) {
    await redis.set(activeKey(userId), String(nowMs), LIMITS.presence.idleAfterMinutes * 60);
    notifyActiveBeat(userId, new Date(nowMs));
  }
  await recomputeAndMaybeEmit(userId);
}

/**
 * Lúc socket disconnect (be.md §5.1) — xoá field thiết bị này khỏi lease NGAY
 * (để `reap` phát hiện sớm hơn khi hết lease tự nhiên), nhưng KHÔNG gọi
 * `recomputeAndMaybeEmit` ở đây: "không hứa tức thì" — user có thể có thiết
 * bị khác vẫn beat, hoặc đang reconnect ngay (mất mạng chập chờn) — để `reap`
 * (mỗi phút) quyết định thay vì phát OFFLINE rồi ONLINE ngay sau đó.
 */
export async function onDeviceDisconnect(userId: string, deviceId: string): Promise<void> {
  await redis.hdel(devKey(userId), deviceId);
}

/** `presence:set` (be.md §5.4) — bật/tắt DND thủ công, LUÔN phát lại (force) kể cả khi trạng thái công khai không đổi (vd DND→DND nhưng `until` mới). */
export async function setDnd(userId: string, dnd: boolean, until?: string): Promise<void> {
  if (dnd) {
    await redis.set(dndKey(userId), until ?? "1");
  } else {
    await redis.del(dndKey(userId));
  }
  await recomputeAndMaybeEmit(userId, true);
}

// ─── Tính trạng thái (be.md §5.4 computeState) ───────────────────────────

/**
 * Bảng chân lý (README §2, đúng thứ tự ưu tiên):
 *   1. Không thiết bị nào beat trong `leaseSeconds` → OFFLINE
 *   2. Có cờ DND → DND
 *   3. Không có `presence:active` (không tương tác ≥ `idleAfterMinutes`) → IDLE
 *   4. Còn lại → ONLINE
 */
export async function computeState(userId: string): Promise<RawPresenceState> {
  const nowMs = Date.now();
  const devices = await redis.hgetall(devKey(userId));
  const leaseMs = LIMITS.presence.leaseSeconds * 1000;
  const alive = Object.values(devices).some((lastBeat) => nowMs - Number(lastBeat) <= leaseMs);
  if (!alive) return "OFFLINE";

  const dnd = await redis.exists(dndKey(userId));
  if (dnd) return "DND";

  const active = await redis.exists(activeKey(userId));
  if (!active) return "IDLE";

  return "ONLINE";
}

/** `showPresence=false` (`User.privacy`, cache qua `getUserStatusCached` — be.md README §2) → mọi người khác thấy `HIDDEN` thay vì trạng thái thật. */
async function isHiddenFromOthers(userId: string): Promise<boolean> {
  const snap = await getUserStatusCached(userId);
  return snap?.showPresence === false;
}

/**
 * Tính lại trạng thái, so với trạng thái đã phát gần nhất — chỉ phát khi ĐỔI
 * (hoặc `force`, vd đổi DND), có throttle 5s/user chống xả bão khi trạng thái
 * dao động liên tục (OFFLINE luôn được phát ngay, không throttle — README §1
 * RT-04 "OFFLINE phát 1 lần tới audience").
 */
export async function recomputeAndMaybeEmit(userId: string, force = false): Promise<void> {
  const state = await computeState(userId);
  const prev = await redis.get<string>(stateKey(userId));
  if (state === prev && !force) return;

  if (!force && state !== "OFFLINE") {
    const acquired = await redis.setNx(throttleKey(userId), "1", LIMITS.realtime.presenceThrottleSeconds);
    // Hết throttle (đã phát trong 5s gần đây) → bỏ lượt này, `presence.reap`
    // (chạy mỗi phút) sẽ phát bù nếu tới lúc đó vẫn còn khác trạng thái cũ.
    if (!acquired) return;
  }

  await redis.set(stateKey(userId), state, STATE_TTL_SECONDS);

  const hidden = await isHiddenFromOthers(userId);
  const publicState: PresenceState = hidden ? "HIDDEN" : state;
  presenceUpdatesTotal.inc({ state: publicState });

  const rooms = await audienceRooms(userId);
  const payload = { userId, state: publicState };
  // p1-08 BLOCK-06 — không gửi presence của `userId` tới người đã chặn/bị `userId` chặn.
  const blockedPeers = rooms.length > 0 ? [...(await hiddenFrom(userId))] : [];
  for (const room of rooms) {
    if (blockedPeers.length > 0) emitToRoom(room, "presence:updated", payload, blockedPeers);
    else emitToRoom(room, "presence:updated", payload);
  }
}

// ─── Reap (job `presence.reap`, be.md §7 — mỗi phút) ─────────────────────

/**
 * Quét mọi `presence:state:*` khác OFFLINE — không có trigger nào khác (không
 * heartbeat, không disconnect ngay) đưa 1 user về OFFLINE khi thiết bị cuối
 * cùng của họ chỉ lặng lẽ hết lease (mất mạng, app bị kill) — reap là nơi DUY
 * NHẤT phát hiện + phát OFFLINE trong trường hợp này (be.md §5.1 "không hứa
 * tức thì lúc disconnect").
 */
export async function reap(): Promise<number> {
  const keys = await redis.scanKeys(`${STATE_KEY_PREFIX}*`);
  let recomputed = 0;
  for (const key of keys) {
    const userId = key.slice(STATE_KEY_PREFIX.length);
    if (!userId) continue;
    const prev = await redis.get<string>(stateKey(userId));
    if (prev === "OFFLINE") continue;
    await recomputeAndMaybeEmit(userId);
    recomputed += 1;
  }
  return recomputed;
}

// ─── REST `GET /presence` (be.md §4) ─────────────────────────────────────

/**
 * Trạng thái của `userIds` theo góc nhìn `viewerId`. Chính chủ luôn thấy
 * trạng thái thật của mình. Với người khác: Phase 0 CHƯA có resolver audience
 * thật đăng ký (`registerPresenceAudience`) nên KHÔNG thể xác minh viewer có
 * thuộc audience của target hay không → mặc định đóng, trả `HIDDEN` (an toàn
 * hơn lộ nhầm) — id nằm trong `audienceRooms(target)` dưới dạng `user:{viewerId}`
 * (case hội thoại DIRECT, README §2) được nhận diện đúng; case "cùng workspace"
 * cần Phase 1 hoàn thiện resolver để phòng `ws:*` được đối chiếu.
 */
export async function getStates(viewerId: string, userIds: string[]): Promise<Record<string, PresenceEntry>> {
  const result: Record<string, PresenceEntry> = {};
  await Promise.all(
    userIds.map(async (userId) => {
      if (userId === viewerId) {
        result[userId] = { state: await computeState(userId) };
        return;
      }

      const rooms = await audienceRooms(userId);
      const viewerIsAudience = rooms.includes(ROOM.user(viewerId));
      if (!viewerIsAudience || (await hiddenFrom(userId)).has(viewerId)) {
        result[userId] = { state: "HIDDEN" };
        return;
      }

      const [state, hidden] = await Promise.all([computeState(userId), isHiddenFromOthers(userId)]);
      result[userId] = { state: hidden ? "HIDDEN" : state };
    })
  );
  return result;
}
