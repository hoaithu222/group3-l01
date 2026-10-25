import type { StudyItemDto, StudySetDetailDto } from '../api/study.types';

/** Dữ liệu giả dùng chung cho test của feature `study` — hình dạng đúng như BE trả (be.md p4-01 §14). */
export function makeItem(overrides: Partial<StudyItemDto> = {}): StudyItemDto {
  return {
    acceptedAnswers: [],
    answerText: 'Định nghĩa',
    audioAssetId: null,
    backMediaAssetId: null,
    correctOptionIds: [],
    explanation: null,
    frontMediaAssetId: null,
    id: 'i1',
    matchMode: 'IGNORE_CASE',
    options: [],
    order: 1024,
    prompt: 'Thuật ngữ',
    setId: 's1',
    tags: [],
    type: 'FLASHCARD',
    updatedAt: '2026-09-20T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

export function makeChoiceItem(overrides: Partial<StudyItemDto> = {}): StudyItemDto {
  return makeItem({
    answerText: null,
    correctOptionIds: ['o_bbbbbb'],
    id: 'i2',
    options: [
      { id: 'o_aaaaaa', mediaAssetId: null, text: 'Hà Nội' },
      { id: 'o_bbbbbb', mediaAssetId: 'asset-1', text: 'Huế' },
    ],
    order: 2048,
    prompt: 'Thủ đô của Việt Nam?',
    type: 'MULTIPLE_CHOICE',
    ...overrides,
  });
}

export function makeSet(overrides: Partial<StudySetDetailDto> = {}): StudySetDetailDto {
  return {
    copiedFromId: null,
    copyCount: 0,
    coverAssetId: null,
    coverThumbUrl: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    description: 'Mô tả bộ',
    hasQuiz: true,
    hiddenAt: null,
    hiddenReason: null,
    id: 's1',
    itemCount: 2,
    itemTypesMask: 3,
    language: null,
    myPermissions: {
      delete: true,
      duplicate: true,
      edit: true,
      hide: false,
      report: false,
      unhide: false,
    },
    owner: { id: 'me', name: 'Tôi' },
    ownerId: 'me',
    status: 'ACTIVE',
    tags: ['toán'],
    title: 'Bộ học thử',
    updatedAt: '2026-09-20T00:00:00.000Z',
    version: 3,
    visibility: 'PRIVATE',
    workspaceId: null,
    ...overrides,
  };
}
