import type { StudyItem } from "../entities/study-item.interface";
import type { SrProgress } from "../entities/sr.interface";

export interface SrProgressDto {
  itemId: string;
  setId: string;
  status: SrProgress["status"];
  interval: number;
  repetition: number;
  easiness: number;
  lapses: number;
  nextReviewAt: string;
  lastRating: SrProgress["lastRating"];
  lastReviewedAt: string | null;
}

export function toProgressDto(p: SrProgress): SrProgressDto {
  return {
    itemId: p.itemId,
    setId: p.setId,
    status: p.status,
    interval: p.interval,
    repetition: p.repetition,
    easiness: p.easiness,
    lapses: p.lapses,
    nextReviewAt: p.nextReviewAt.toISOString(),
    lastRating: p.lastRating,
    lastReviewedAt: p.lastReviewedAt ? p.lastReviewedAt.toISOString() : null,
  };
}

/** Thẻ đến hạn kèm NỘI DUNG (chế độ học: có đáp án/giải thích — người ôn tự lật rồi chấm mức nhớ). Media chỉ trả id (app lấy URL ký qua `GET /assets/:id/url`). */
export interface SrDueItemDto extends SrProgressDto {
  setTitle: string;
  type: StudyItem["type"];
  prompt: string;
  answerText: string | null;
  options: Array<{ id: string; text: string; mediaAssetId: string | null }>;
  correctOptionIds: string[];
  acceptedAnswers: string[];
  matchMode: StudyItem["matchMode"];
  explanation: string | null;
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  audioAssetId: string | null;
  tags: string[];
}

export function toDueItemDto(p: SrProgress, item: StudyItem, setTitle: string): SrDueItemDto {
  return {
    ...toProgressDto(p),
    setTitle,
    type: item.type,
    prompt: item.prompt,
    answerText: item.answerText,
    options: item.options.map((o) => ({ id: o.id, text: o.text, mediaAssetId: o.mediaAssetId })),
    correctOptionIds: item.correctOptionIds,
    acceptedAnswers: item.acceptedAnswers,
    matchMode: item.matchMode,
    explanation: item.explanation,
    frontMediaAssetId: item.frontMediaAssetId,
    backMediaAssetId: item.backMediaAssetId,
    audioAssetId: item.audioAssetId,
    tags: item.tags,
  };
}
