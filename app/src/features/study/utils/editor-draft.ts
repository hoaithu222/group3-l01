import type { FillMatchMode, StudyItemDto, StudyItemType } from '../api/study.types';
import { newLocalId } from './local-id';

/**
 * Bản NHÁP của trình soạn (app.md p4-01 §5) — CHỈ trong bộ nhớ. Mỗi mục khoá bằng `clientItemKey` (= `id` server với
 * mục đã có, uuid cục bộ với mục mới) để lỗi `STUDY_001` gắn đúng mục và `afterClientItemKey` làm neo thứ tự.
 *
 * ⚠️ Nháp GIỮ NGUYÊN mọi trường mà UI chưa sửa được (ảnh/âm thanh mặt trước-sau, ảnh lựa chọn, thẻ mục): BE ghi ĐÈ
 * toàn bộ nội dung mục khi upsert, nên bỏ chúng đi là lặng lẽ XOÁ media của mục đã có.
 */
export interface DraftOption {
  /** Khoá cục bộ ổn định (không phải id server) để `key` của React và `correctKeys` không lệch khi thêm/xoá. */
  key: string;
  /** Id lựa chọn của server (`o_…`) — gửi lại để giữ đáp án ổn định qua các lần sửa. */
  id?: string;
  text: string;
  mediaAssetId: string | null;
}

export interface DraftItem {
  clientItemKey: string;
  /** Có = mục đã có trên server. */
  id?: string;
  type: StudyItemType;
  prompt: string;
  explanation: string;
  /** FLASHCARD. */
  answerText: string;
  /** MULTIPLE_CHOICE / MULTI_SELECT. */
  options: DraftOption[];
  correctKeys: string[];
  /** TRUE_FALSE. */
  correct: boolean;
  /** FILL_BLANK. */
  acceptedAnswers: string[];
  matchMode: FillMatchMode;
  tags: string[];
  frontMediaAssetId: string | null;
  backMediaAssetId: string | null;
  audioAssetId: string | null;
}

export interface EditorDraft {
  baseVersion: number;
  base: Record<string, DraftItem>;
  baseOrder: string[];
  items: Record<string, DraftItem>;
  order: string[];
}

export function newOption(text = ''): DraftOption {
  return { key: newLocalId('opt'), mediaAssetId: null, text };
}

export function newDraftItem(type: StudyItemType): DraftItem {
  const options =
    type === 'MULTIPLE_CHOICE' || type === 'MULTI_SELECT' ? [newOption(), newOption()] : [];
  return {
    acceptedAnswers: [],
    answerText: '',
    audioAssetId: null,
    backMediaAssetId: null,
    clientItemKey: newLocalId('item'),
    correct: true,
    correctKeys: [],
    explanation: '',
    frontMediaAssetId: null,
    matchMode: 'IGNORE_CASE',
    options,
    prompt: '',
    tags: [],
    type,
  };
}

export function draftFromDto(dto: StudyItemDto): DraftItem {
  const options = dto.options.map<DraftOption>((option) => ({
    id: option.id,
    key: option.id,
    mediaAssetId: option.mediaAssetId,
    text: option.text,
  }));
  return {
    acceptedAnswers: [...dto.acceptedAnswers],
    answerText: dto.answerText ?? '',
    audioAssetId: dto.audioAssetId,
    backMediaAssetId: dto.backMediaAssetId,
    clientItemKey: dto.id,
    correct: dto.correctOptionIds.includes('o_true'),
    correctKeys: dto.correctOptionIds.filter((id) => options.some((option) => option.key === id)),
    explanation: dto.explanation ?? '',
    frontMediaAssetId: dto.frontMediaAssetId,
    id: dto.id,
    matchMode: dto.matchMode,
    options: dto.type === 'TRUE_FALSE' ? [] : options,
    prompt: dto.prompt,
    tags: [...dto.tags],
    type: dto.type,
  };
}

/** Nạp mục của server vào nháp mới: `base` và `items` ban đầu GIỐNG HỆT nhau (chưa có thay đổi). */
export function createEditorDraft(baseVersion: number, dtos: readonly StudyItemDto[]): EditorDraft {
  const sorted = [...dtos].sort((a, b) => a.order - b.order);
  const items: Record<string, DraftItem> = {};
  sorted.forEach((dto) => (items[dto.id] = draftFromDto(dto)));
  return {
    base: { ...items },
    baseOrder: sorted.map((dto) => dto.id),
    baseVersion,
    items,
    order: sorted.map((dto) => dto.id),
  };
}
