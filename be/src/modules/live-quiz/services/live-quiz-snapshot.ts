import { LIMITS } from "../../../core/constants/limits";
import type { QuizLobbyPayload, QuizPlayerView, QuizSnapshot } from "../entities/live-quiz.events";
import type { QuizPlayer } from "../entities/live-quiz.interface";
import type { ILiveQuizStore } from "../redis/live-quiz.store.types";
import { requireMeta } from "./live-quiz-access";

export function playerView(p: QuizPlayer): QuizPlayerView {
  return { userId: p.userId, nickname: p.nickname, avatarAssetId: p.avatarAssetId };
}

/**
 * Payload `quiz:lobby` GỬI CẢ PHÒNG: danh sách người chơi thôi — KHÔNG có `pin` (người chơi đã có PIN vì họ nhập nó; chỉ host cần
 * PIN và nhận nó ở snapshot RIÊNG `GET/POST` — trước đây payload này dựng bằng snapshot của host nên lộ PIN cho cả phòng).
 */
export async function buildLobby(store: ILiveQuizStore, sessionId: string, nowMs: number): Promise<QuizLobbyPayload> {
  const players = await store.players(sessionId);
  return { sessionId, players: players.map(playerView), playersCount: players.length, serverNow: nowMs };
}

/**
 * Snapshot theo góc nhìn `viewerId` (be.md §4): KHÔNG có đáp án câu đang mở; `pin` + `answeredCount` chỉ host; `reveal` chỉ khi câu
 * đã đóng (phase REVEAL — người vào lại/nối lại giữa lúc công bố vẫn thấy đáp án).
 */
export async function buildSnapshot(store: ILiveQuizStore, sessionId: string, viewerId: string, nowMs: number): Promise<QuizSnapshot> {
  const meta = await requireMeta(store, sessionId);
  const [players, scores] = await Promise.all([store.players(sessionId), store.scores(sessionId)]);
  const open = meta.phase === "QUESTION" || meta.phase === "REVEAL";
  const isHost = meta.hostId === viewerId;
  const q = open ? await store.question(sessionId, meta.currentIndex) : null;
  const snapshot: QuizSnapshot = {
    id: sessionId,
    status: meta.status,
    phase: meta.phase,
    ...(isHost ? { pin: meta.pin } : {}),
    hostId: meta.hostId,
    setId: meta.setId,
    setTitle: meta.setTitle,
    currentIndex: meta.currentIndex,
    total: meta.total,
    question: q ? { index: meta.currentIndex, prompt: q.prompt, options: q.options, deadlineAt: meta.deadlineAtMs, questionStartedAt: meta.questionStartedAtMs } : null,
    players: players.map(playerView),
    playersCount: players.length,
    leaderboardTop: scores.slice(0, LIMITS.liveQuiz.leaderboardTop),
    me: scores.find((s) => s.userId === viewerId) ?? null,
    version: meta.version,
    serverNow: nowMs,
  };
  if (isHost && open) snapshot.answeredCount = (await store.counts(sessionId, meta.currentIndex)).answered;
  if (meta.phase === "REVEAL") {
    const [correct, stats] = await Promise.all([store.correctOf(sessionId, meta.currentIndex), store.stats(sessionId, meta.currentIndex)]);
    snapshot.reveal = { index: meta.currentIndex, correct: correct?.correctIndex ?? null, stats, explanation: q?.explanation ?? null };
  }
  return snapshot;
}
