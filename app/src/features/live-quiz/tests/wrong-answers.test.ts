import { resetLiveQuizStores, useLiveQuizStore } from '../store/live-quiz.store';
import { wrongAnswersOf } from '../utils/wrong-answers';

/** app.md p5-01 §5/§3: store theo phiên (không persist, xoá khi đăng xuất) + "Ôn lại câu sai" từ những gì đã thấy. */

const OPTIONS = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'];

function seed(): void {
  const store = useLiveQuizStore.getState();
  store.rememberQuestion('s1', 0, { options: OPTIONS, prompt: 'Thủ đô của Việt Nam?' });
  store.rememberReveal('s1', 0, { correct: 0, explanation: 'Hà Nội là thủ đô.' });
  store.saveAnswer('s1', 0, { acked: true, choice: 0 });

  store.rememberQuestion('s1', 1, { options: OPTIONS, prompt: 'Cố đô là?' });
  store.rememberReveal('s1', 1, { correct: 1, explanation: null });
  store.saveAnswer('s1', 1, { acked: true, choice: 3 });

  // Câu 2: không trả lời ⇒ cũng là sai.
  store.rememberQuestion('s1', 2, { options: OPTIONS, prompt: 'Thành phố ven sông Hàn?' });
  store.rememberReveal('s1', 2, { correct: 2, explanation: 'Đà Nẵng.' });
}

beforeEach(() => resetLiveQuizStores());

describe('live-quiz.store', () => {
  it('đổi sang phiên khác ⇒ bắt đầu từ rỗng, lựa chọn phiên cũ không lọt sang', () => {
    const store = useLiveQuizStore.getState();
    store.saveAnswer('s1', 0, { acked: true, choice: 2 });
    store.saveAnswer('s2', 0, { acked: false, choice: 1 });

    const state = useLiveQuizStore.getState();
    expect(state.sessionId).toBe('s2');
    expect(state.answers).toEqual({ 0: { acked: false, choice: 1 } });
  });

  it('cùng phiên ⇒ giữ lựa chọn theo chỉ số câu (dựng lại màn giữa câu vẫn nhớ)', () => {
    const store = useLiveQuizStore.getState();
    store.saveAnswer('s1', 0, { acked: false, choice: 2 });
    store.saveAnswer('s1', 0, { acked: true, choice: 2 });
    store.saveAnswer('s1', 1, { acked: true, choice: 0 });

    expect(useLiveQuizStore.getState().answers).toEqual({
      0: { acked: true, choice: 2 },
      1: { acked: true, choice: 0 },
    });
  });

  it('resetLiveQuizStores (đăng xuất) ⇒ sạch hết', () => {
    seed();
    resetLiveQuizStores();

    const state = useLiveQuizStore.getState();
    expect(state).toMatchObject({ answers: {}, questions: {}, reveals: {}, sessionId: null });
  });
});

describe('wrongAnswersOf', () => {
  it('chỉ trả câu sai + câu bỏ trống, theo thứ tự câu, kèm đáp án đúng và giải thích', () => {
    seed();
    const state = useLiveQuizStore.getState();

    const wrong = wrongAnswersOf(state, 's1');

    expect(wrong.map((w) => w.index)).toEqual([1, 2]);
    expect(wrong[0]).toMatchObject({
      correctText: 'B. Huế',
      explanation: null,
      myText: 'D. Cần Thơ',
      prompt: 'Cố đô là?',
    });
    expect(wrong[1]).toMatchObject({ correctText: 'C. Đà Nẵng', myText: null });
  });

  it('phiên khác với phiên trong store ⇒ rỗng (không trộn dữ liệu)', () => {
    seed();
    expect(wrongAnswersOf(useLiveQuizStore.getState(), 's2')).toEqual([]);
  });

  it('câu chưa nhận `quiz:reveal` hoặc đáp án đúng null ⇒ bỏ, không đoán', () => {
    const store = useLiveQuizStore.getState();
    store.rememberQuestion('s1', 0, { options: OPTIONS, prompt: 'Chưa công bố' });
    store.rememberQuestion('s1', 1, { options: OPTIONS, prompt: 'Không có đáp án' });
    store.rememberReveal('s1', 1, { correct: null, explanation: null });

    expect(wrongAnswersOf(useLiveQuizStore.getState(), 's1')).toEqual([]);
  });
});
