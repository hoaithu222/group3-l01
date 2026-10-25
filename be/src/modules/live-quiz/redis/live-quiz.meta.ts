import type { LiveQuizStatusValue, QuizMeta, QuizPhase } from "../entities/live-quiz.interface";
import type { QuizInit } from "./live-quiz.store.types";

export function num(v: string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** `HGETALL quiz:{id}:meta` → `QuizMeta` (số nguyên/ms UNIX; khoá không tồn tại → `null`). */
export function parseMeta(raw: Record<string, string>): QuizMeta | null {
  if (!raw.status) return null;
  return {
    status: raw.status as LiveQuizStatusValue,
    phase: (raw.phase ?? "LOBBY") as QuizPhase,
    currentIndex: num(raw.currentIndex, -1),
    questionStartedAtMs: num(raw.questionStartedAtMs),
    deadlineAtMs: num(raw.deadlineAtMs),
    version: num(raw.version, 1),
    hostLastSeenMs: num(raw.hostLastSeenMs),
    hostId: raw.hostId ?? "",
    workspaceId: raw.workspaceId ? raw.workspaceId : null,
    setId: raw.setId ?? "",
    setTitle: raw.setTitle ?? "",
    pin: raw.pin ?? "",
    total: num(raw.total),
    seconds: num(raw.seconds),
    revealSeconds: num(raw.revealSeconds),
    autoAdvance: raw.autoAdvance === "1",
    base: num(raw.base),
    bonus: num(raw.bonus),
  };
}

/** Hash meta lúc tạo phiên: WAITING/LOBBY, version 1, chưa có câu (`currentIndex = -1`). */
export function initialMetaHash(input: QuizInit): Record<string, string> {
  const m = input.meta;
  return {
    status: "WAITING",
    phase: "LOBBY",
    currentIndex: "-1",
    questionStartedAtMs: "0",
    deadlineAtMs: "0",
    version: "1",
    hostLastSeenMs: "0",
    pin: input.pin,
    hostId: m.hostId,
    workspaceId: m.workspaceId ?? "",
    setId: m.setId,
    setTitle: m.setTitle,
    total: String(m.total),
    seconds: String(m.seconds),
    revealSeconds: String(m.revealSeconds),
    autoAdvance: m.autoAdvance ? "1" : "0",
    base: String(m.base),
    bonus: String(m.bonus),
  };
}
