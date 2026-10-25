import type { MockAnswerInput, MockMyAnswerDto } from '../api/mock-attempts.types';
import { MOCK_PLAYER_MAX_AGE_MS } from '../store/mock-player.constants';
import type { MockPlayerEntry } from '../store/mock-player.types';

/** Mục rỗng cho một lượt mới. */
export function emptyEntry(now: number = Date.now()): MockPlayerEntry {
  return { answers: {}, currentIndex: 0, events: [], flagged: [], pending: [], updatedAt: now };
}

/** Hai đáp án cùng nội dung? (`timeMs` không tính — chỉ thống kê.) */
export function sameAnswer(
  a: MockAnswerInput | undefined,
  b: MockAnswerInput | undefined,
): boolean {
  if (!a || !b) return a === b;
  const left = a.optionIds ?? [];
  const right = b.optionIds ?? [];
  return (
    a.itemId === b.itemId &&
    left.length === right.length &&
    left.every((id, i) => id === right[i]) &&
    (a.text ?? '') === (b.text ?? '')
  );
}

/** Câu coi là "đã trả lời": có lựa chọn hoặc có chữ. */
export function isAnswered(a: MockAnswerInput | undefined): boolean {
  return Boolean(a && ((a.optionIds?.length ?? 0) > 0 || (a.text ?? '').trim().length > 0));
}

/**
 * Đáp án hiệu lực khi mở/làm lượt dở: `myAnswers` của server làm nền, câu còn CHƯA lên server (`pending`) thì bản
 * ở máy THẮNG — đó là thứ người dùng vừa chọn mà mạng chưa kịp gửi. Câu đã xác nhận lấy bản server (nguồn sự thật).
 */
export function mergeAnswers(
  server: readonly MockMyAnswerDto[],
  entry: MockPlayerEntry | undefined,
): Record<string, MockAnswerInput> {
  const merged: Record<string, MockAnswerInput> = {};
  for (const [itemId, answer] of Object.entries(entry?.answers ?? {})) merged[itemId] = answer;
  for (const a of server) {
    if (entry?.pending.includes(a.itemId)) continue;
    merged[a.itemId] = { itemId: a.itemId, optionIds: a.optionIds, text: a.text ?? undefined };
  }
  return merged;
}

/** Loại mục quá 24 giờ và mục hỏng hình dạng — dữ liệu trên đĩa không đáng tin tuyệt đối (bản cũ, ghi dở). */
export function pruneStaleAttempts(
  raw: unknown,
  now: number = Date.now(),
): Record<string, MockPlayerEntry> {
  if (!raw || typeof raw !== 'object') return {};
  const kept: Record<string, MockPlayerEntry> = {};
  for (const [id, value] of Object.entries(raw as Record<string, Partial<MockPlayerEntry>>)) {
    if (!value || typeof value.updatedAt !== 'number') continue;
    if (now - value.updatedAt > MOCK_PLAYER_MAX_AGE_MS) continue;
    kept[id] = {
      answers: value.answers && typeof value.answers === 'object' ? value.answers : {},
      currentIndex: typeof value.currentIndex === 'number' ? value.currentIndex : 0,
      events: Array.isArray(value.events) ? value.events : [],
      flagged: Array.isArray(value.flagged) ? value.flagged : [],
      pending: Array.isArray(value.pending) ? value.pending : [],
      updatedAt: value.updatedAt,
    };
  }
  return kept;
}

/** Áp `update` lên mục của `attemptId` (tạo nếu chưa có) và đóng dấu `updatedAt`. */
export function patchEntry(
  attempts: Record<string, MockPlayerEntry>,
  attemptId: string,
  update: (entry: MockPlayerEntry) => MockPlayerEntry,
): { attempts: Record<string, MockPlayerEntry> } {
  const entry = attempts[attemptId] ?? emptyEntry();
  return { attempts: { ...attempts, [attemptId]: { ...update(entry), updatedAt: Date.now() } } };
}
