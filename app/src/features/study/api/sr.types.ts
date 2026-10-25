import type { StudyItemDto } from './study.types';

/** Ôn tập ngắt quãng SM-2 (be `sr.presenter.ts`, p4-02 be.md §4). */
export type SrRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export type SrStatus = 'NEW' | 'LEARNING' | 'REVIEW' | 'SUSPENDED';

export interface SrProgressDto {
  itemId: string;
  setId: string;
  status: SrStatus;
  interval: number;
  repetition: number;
  easiness: number;
  lapses: number;
  nextReviewAt: string;
  lastRating: SrRating | null;
  lastReviewedAt: string | null;
}

/** Thẻ đến hạn KÈM nội dung (có đáp án) — cùng các trường nội dung như `StudyItemDto`. */
export interface SrDueItemDto
  extends
    SrProgressDto,
    Pick<
      StudyItemDto,
      | 'type'
      | 'prompt'
      | 'answerText'
      | 'options'
      | 'correctOptionIds'
      | 'acceptedAnswers'
      | 'matchMode'
      | 'explanation'
      | 'frontMediaAssetId'
      | 'backMediaAssetId'
      | 'audioAssetId'
      | 'tags'
    > {
  setTitle: string;
}

export interface SrDueResult {
  items: SrDueItemDto[];
  remainingToday: number;
  serverNow: string;
}

export interface SrReviewPayload {
  itemId: string;
  rating: SrRating;
  clientReviewId: string;
  reviewedAt?: string;
}

export interface SrReviewResult {
  progress: SrProgressDto;
  remainingToday: number;
}

export interface SrEnrollResult {
  setId: string;
  enrolledItems: number;
  newPerDay: number;
}

export interface SrSummary {
  dueToday: number;
  newToday: number;
  dueNext7Days: { date: string; count: number }[];
  reviewedToday: number;
  reviewStreakDays: number;
  serverNow: string;
}
