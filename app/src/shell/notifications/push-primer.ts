import { create } from 'zustand';

import { getPushPermission, type PushPermissionState } from '@/core/notifications';
import { readJson, removeKey, writeJson } from '@/core/storage/app-storage';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Lời mời bật thông báo ("primer") — p0-06 `app.md` §3 "Lời mời bật thông báo", §5 "State client".
 *
 * Hiện TRƯỚC hộp thoại hệ thống, nêu lợi ích; "Để sau" không hỏi lại trong 7 ngày. Lý do phải có primer:
 * hộp thoại hệ thống chỉ hỏi được một lần (iOS) hoặc hai lần (Android) — hỏi lúc mở app khi người dùng
 * chưa hiểu để làm gì là cách nhanh nhất để mất hẳn quyền.
 */

/** "Để sau" → không hỏi lại trong chừng này ngày. */
export const PRIMER_SNOOZE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Trạng thái primer của MỘT người dùng — `AsyncStorage`, xoá khi đăng xuất. */
export interface PrimerRecord {
  /** Không hiện lại trước mốc này (ms epoch). */
  dismissedUntil: number | null;
  /** Lần cuối primer được hiện (ms epoch) — để chẩn đoán, không dùng cho quyết định. */
  lastPromptAt: number | null;
}

export const EMPTY_PRIMER_RECORD: PrimerRecord = { dismissedUntil: null, lastPromptAt: null };

/** Khoá theo người dùng — máy dùng chung không thừa hưởng "Để sau" của người trước. */
export function primerStorageKey(userId: string): string {
  return `push-primer.v1.${userId}`;
}

/**
 * Có nên hiện primer không. Hàm thuần.
 *
 *  · `granted`  — không cần.
 *  · `denied`   — hỏi lại không hiện được gì; lối duy nhất là Cài đặt hệ thống, và màn Cài đặt thông báo
 *                 đã chỉ rõ (PUSH-11 — "không hỏi lại liên tục"). Không hiện primer.
 *  · `undetermined` + chưa hết hạn "Để sau" → chưa.
 */
export function shouldShowPrimer(input: {
  now: number;
  permission: PushPermissionState | null;
  record: PrimerRecord;
}): boolean {
  if (input.permission !== 'undetermined') return false;
  return input.record.dismissedUntil === null || input.record.dismissedUntil <= input.now;
}

export async function readPrimerRecord(userId: string): Promise<PrimerRecord> {
  const stored = await readJson<Partial<PrimerRecord>>(primerStorageKey(userId));
  return {
    dismissedUntil: typeof stored?.dismissedUntil === 'number' ? stored.dismissedUntil : null,
    lastPromptAt: typeof stored?.lastPromptAt === 'number' ? stored.lastPromptAt : null,
  };
}

/** Ghi nhận primer đã hiện và được đóng (bấm "Để sau", hoặc bấm "Bật" — dù hộp thoại hệ thống trả gì). */
export async function snoozePrimer(userId: string, now: number = Date.now()): Promise<void> {
  await writeJson(primerStorageKey(userId), {
    dismissedUntil: now + PRIMER_SNOOZE_DAYS * DAY_MS,
    lastPromptAt: now,
  } satisfies PrimerRecord);
}

export async function clearPrimerRecord(userId: string): Promise<void> {
  await removeKey(primerStorageKey(userId));
}

/** Route con của `messages`/`workspaces` KHÔNG phải một cuộc trò chuyện/nhóm cụ thể. */
const NON_ROOM_SEGMENTS: ReadonlySet<string> = new Set(['archived', 'calls', 'new', 'new-group', 'pending']);

/**
 * Người dùng vừa MỞ một cuộc trò chuyện (`/messages/:id…`) hoặc VÀO một nhóm (`/workspaces/:id…`) — thời
 * điểm `app.md` §3 chọn để giới thiệu thông báo (đã thấy giá trị, chưa bị làm phiền lúc onboarding).
 * Hàm thuần — test theo đường dẫn.
 */
export function isPrimerRoute(pathname: string): boolean {
  const [first, second] = pathname.split('/').filter(Boolean);
  if (!second || NON_ROOM_SEGMENTS.has(second)) return false;
  return first === 'messages' || first === 'workspaces';
}

interface PrimerVisibilityState {
  hide: () => void;
  show: () => void;
  visible: boolean;
}

/** Cờ hiện/ẩn tấm primer — `PushPrimerHost` là nơi DUY NHẤT vẽ nó. */
export const usePushPrimerStore = create<PrimerVisibilityState>()((set) => ({
  hide: () => set({ visible: false }),
  show: () => set({ visible: true }),
  visible: false,
}));

/**
 * Xin hiện primer nếu đủ điều kiện. Gọi từ bất kỳ đâu người dùng vừa làm việc cho thấy họ CẦN thông báo:
 * lần đầu vào nhóm / mở cuộc trò chuyện (`PushPrimerHost` tự gọi theo route), bật nhắc họp (p2-04 gọi thẳng).
 *
 * An toàn khi gọi lặp: không hiện gì nếu đã cấp/đã từ chối/đang "Để sau", và không hiện chồng khi đã mở.
 * Trả `true` khi tấm được bật.
 */
export async function requestPushPrimer(): Promise<boolean> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || usePushPrimerStore.getState().visible) return false;

  const [permission, record] = await Promise.all([getPushPermission(), readPrimerRecord(userId)]);
  if (!shouldShowPrimer({ now: Date.now(), permission, record })) return false;

  // Đăng xuất/đổi người dùng trong lúc chờ đọc `AsyncStorage`.
  if (useAuthStore.getState().user?.id !== userId) return false;

  usePushPrimerStore.getState().show();
  return true;
}
