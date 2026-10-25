import type {
  MockAttemptDto,
  MockInProgressDto,
  MockQuestionPublic,
  MockResultDto,
  MockResultQuestionDto,
  MockTagScore,
} from '../api/mock-attempts.types';

/** Dữ liệu giả thi thử — hình dạng đúng như BE trả (`mock-attempt.presenter.ts`, `sr.presenter.ts`). Không phải test. */

export const ATTEMPT_ID = 'a1';

export function makeQuestion(
  index: number,
  overrides: Partial<MockQuestionPublic> = {},
): MockQuestionPublic {
  return {
    frontMediaAssetId: null,
    index,
    itemId: `q${index + 1}`,
    options: [
      { id: 'o_aaaaaa', mediaAssetId: null, text: `Đáp án A${index + 1}` },
      { id: 'o_bbbbbb', mediaAssetId: null, text: `Đáp án B${index + 1}` },
    ],
    prompt: `Câu hỏi số ${index + 1}?`,
    type: 'MULTIPLE_CHOICE',
    ...overrides,
  };
}

export function makeAttempt(overrides: Partial<MockAttemptDto> = {}): MockAttemptDto {
  return {
    answeredCount: 0,
    backgroundCount: 0,
    backgroundMs: 0,
    byTag: [],
    correctCount: null,
    durationSec: 600,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    id: ATTEMPT_ID,
    passPct: 50,
    passed: null,
    scorePct: null,
    setId: 's1',
    setTitle: 'Bộ học thử',
    shuffle: true,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    status: 'IN_PROGRESS',
    submitMode: null,
    submittedAt: null,
    total: 2,
    ...overrides,
  };
}

export function makeInProgress(overrides: Partial<MockInProgressDto> = {}): MockInProgressDto {
  return {
    attempt: makeAttempt(),
    myAnswers: [],
    questions: [makeQuestion(0), makeQuestion(1)],
    serverNow: new Date().toISOString(),
    ...overrides,
  };
}

export function makeResultQuestion(
  index: number,
  overrides: Partial<MockResultQuestionDto> = {},
): MockResultQuestionDto {
  return {
    ...makeQuestion(index),
    acceptedAnswers: [],
    correct: true,
    correctOptionIds: ['o_aaaaaa'],
    explanation: null,
    myAnswer: { itemId: `q${index + 1}`, optionIds: ['o_aaaaaa'], text: null },
    partial: null,
    tags: [],
    ...overrides,
  };
}

export function makeResult(
  attempt: Partial<MockAttemptDto> = {},
  questions: MockResultQuestionDto[] = [
    makeResultQuestion(0),
    makeResultQuestion(1, { correct: false }),
  ],
  extra: Partial<MockResultDto> = {},
): MockResultDto {
  return {
    attempt: makeAttempt({
      correctCount: 1,
      passed: true,
      scorePct: 50,
      status: 'SUBMITTED',
      submitMode: 'MANUAL',
      submittedAt: new Date().toISOString(),
      ...attempt,
    }),
    questions,
    serverNow: new Date().toISOString(),
    ...extra,
  };
}

export const TAGS_3: MockTagScore[] = [
  { correct: 3, tag: 'toán', total: 4 },
  { correct: 1, tag: 'lý', total: 4 },
  { correct: 2, tag: '__untagged', total: 2 },
];
