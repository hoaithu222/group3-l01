import type { AuthUser } from "../../../core/types/express";
import type { QuizMeta } from "../entities/live-quiz.interface";
import { quizErrors } from "../live-quiz.errors";
import type { ILiveQuizStore } from "../redis/live-quiz.store.types";

/** Meta nóng của phiên — Redis đã hết hạn/không có phiên → 404 trung tính `QUIZ_001`. */
export async function requireMeta(store: ILiveQuizStore, sessionId: string): Promise<QuizMeta> {
  const meta = await store.getMeta(sessionId);
  if (!meta) throw quizErrors.notFound();
  return meta;
}

/** Chỉ host: người chơi trong phòng → 403; người ngoài phiên → 404 (không lộ phiên tồn tại). */
export async function requireHost(store: ILiveQuizStore, user: AuthUser, sessionId: string): Promise<QuizMeta> {
  const meta = await requireMeta(store, sessionId);
  if (meta.hostId === user.id) return meta;
  if (await store.hasPlayer(sessionId, user.id)) throw quizErrors.hostOnly();
  throw quizErrors.notFound();
}
