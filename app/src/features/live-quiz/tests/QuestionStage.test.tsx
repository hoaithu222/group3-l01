import { render, screen } from '@testing-library/react-native';

import type { LiveQuizSnapshot } from '../api/live-quiz.types';
import { QuestionStage } from '../components/QuestionStage';
import type { AnswerState } from '../hooks/useQuizAnswer';
import { resetLiveQuizStores, useLiveQuizStore } from '../store/live-quiz.store';
import { OPTIONS, SERVER_NOW, snapshot } from './session-harness';

/**
 * Một câu hỏi từ lúc mở tới lúc công bố: thẻ câu hỏi + đồng hồ + bảng đáp án; điểm vừa nhận = điểm hiện tại − điểm lúc MỞ câu
 * (chụp ở lần dựng đầu, `key` theo chỉ số câu); chuỗi đúng liên tiếp suy từ store; chủ phòng thấy tiến độ trả lời.
 */

const mockAnswer: { current: { code?: string; selected: number | null; state: AnswerState } } = {
  current: { selected: null, state: 'idle' },
};
jest.mock('../hooks/useQuizAnswer', () => ({
  useQuizAnswer: () => ({ choose: jest.fn(), retry: jest.fn(), ...mockAnswer.current }),
}));
jest.mock('../hooks/useRevealHaptics', () => ({ useRevealHaptics: jest.fn() }));

// `Date.now()` thật ≈ hiện tại ⇒ đặt hạn xa để đồng hồ không chạm 0 trong lúc test chạy.
const FAR = Date.now() + 60_000;
const QUESTION = { deadlineAt: FAR, index: 0, options: OPTIONS, prompt: 'Thủ đô của Việt Nam?' };
const REVEAL = { correct: 0, explanation: null, index: 0, stats: { '0': 2, '1': 1 } };

const question = (overrides: Partial<LiveQuizSnapshot> = {}): LiveQuizSnapshot =>
  snapshot({
    phase: 'QUESTION',
    question: QUESTION,
    serverNow: SERVER_NOW,
    status: 'IN_PROGRESS',
    ...overrides,
  });

const stage = (data: LiveQuizSnapshot, isHost = false) => (
  <QuestionStage isHost={isHost} offsetMs={0} question={QUESTION} sessionId="s1" snapshot={data} />
);

beforeEach(() => {
  resetLiveQuizStores();
  mockAnswer.current = { selected: null, state: 'idle' };
});

describe('QuestionStage — người chơi', () => {
  it('đang mở câu: thẻ câu hỏi (đề là header + "Câu 1/3"), đồng hồ và bảng đáp án', async () => {
    await render(stage(question()));

    expect(screen.getByRole('header', { name: 'Thủ đô của Việt Nam?' })).toBeOnTheScreen();
    expect(screen.getByText('Câu 1/3')).toBeOnTheScreen();
    expect(screen.getByText('Thời gian')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'A. Hà Nội' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'B. Huế' })).toBeOnTheScreen();
  });

  it('công bố: đồng hồ và bảng đáp án nhường chỗ cho kết luận + từng phương án', async () => {
    mockAnswer.current = { selected: 0, state: 'sent' };
    await render(stage(question({ phase: 'REVEAL', reveal: REVEAL })));

    expect(screen.queryByText('Thời gian')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByLabelText('Chính xác!')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('A. Hà Nội, 2 người chọn, Đáp án đúng, Bạn đã chọn'),
    ).toBeOnTheScreen();
  });

  it('điểm vừa nhận = điểm hiện tại − điểm lúc mở câu (bảng điểm đến sau lúc công bố)', async () => {
    mockAnswer.current = { selected: 0, state: 'sent' };
    const view = await render(
      stage(question({ me: { cumulativeMs: 0, rank: 4, score: 500, userId: 'u-me' } })),
    );

    // Công bố trước, điểm mới đến sau: chưa có dòng "+N".
    await view.rerender(stage(question({ phase: 'REVEAL', reveal: REVEAL })));
    expect(screen.getByLabelText('Chính xác!')).toBeOnTheScreen();

    await view.rerender(
      stage(
        question({
          me: { cumulativeMs: 0, rank: 2, score: 1200, userId: 'u-me' },
          phase: 'REVEAL',
          reveal: REVEAL,
        }),
      ),
    );
    expect(screen.getByLabelText('Chính xác! Bạn nhận thêm 700 điểm.')).toBeOnTheScreen();
  });

  it('chuỗi đúng: đếm từ store máy này (câu 0 và 1 đúng + câu hiện tại đúng ⇒ chuỗi 3)', async () => {
    const store = useLiveQuizStore.getState();
    store.saveAnswer('s1', 0, { acked: true, choice: 0 });
    store.rememberReveal('s1', 0, { correct: 0, explanation: null });
    store.saveAnswer('s1', 1, { acked: true, choice: 1 });
    store.rememberReveal('s1', 1, { correct: 1, explanation: null });
    store.saveAnswer('s1', 2, { acked: true, choice: 0 });
    mockAnswer.current = { selected: 0, state: 'sent' };
    const current = { ...QUESTION, index: 2 };
    const data = question({
      currentIndex: 2,
      phase: 'REVEAL',
      question: current,
      reveal: { ...REVEAL, index: 2 },
    });

    await render(
      <QuestionStage
        isHost={false}
        offsetMs={0}
        question={current}
        sessionId="s1"
        snapshot={data}
      />,
    );

    expect(screen.getByText('Chuỗi 3 câu đúng liên tiếp')).toBeOnTheScreen();
  });

  it('trả lời sai ⇒ "Chưa đúng" và không có chuỗi', async () => {
    mockAnswer.current = { selected: 1, state: 'sent' };
    await render(stage(question({ phase: 'REVEAL', reveal: REVEAL })));

    expect(screen.getByLabelText('Chưa đúng')).toBeOnTheScreen();
    expect(screen.queryByText(/Chuỗi/)).toBeNull();
  });
});

describe('QuestionStage — chủ phòng', () => {
  it('thấy tiến độ "Đã trả lời a/b" và bảng đáp án CHỈ ĐỂ XEM (không có nút)', async () => {
    await render(stage(question({ answeredCount: 2, playersCount: 5 }), true));

    expect(screen.getByText('Đã trả lời 2/5')).toBeOnTheScreen();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByLabelText('A. Hà Nội')).toBeOnTheScreen();
  });

  it('công bố: không có kết luận cá nhân', async () => {
    await render(stage(question({ phase: 'REVEAL', reveal: REVEAL }), true));

    expect(screen.queryByText('Chính xác!')).toBeNull();
    expect(screen.getByText('67% chọn đúng (2/3 người)')).toBeOnTheScreen();
  });
});
