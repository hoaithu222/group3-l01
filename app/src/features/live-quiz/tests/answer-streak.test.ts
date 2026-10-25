import type { StoredAnswer, StoredReveal } from '../store/live-quiz.store';
import { answerStreak } from '../utils/answer-streak';

/** Chuỗi câu đúng liên tiếp suy từ store máy này — đếm THIẾU chứ không bao giờ đếm thừa. */

const answers = (choices: (number | undefined)[]): Record<number, StoredAnswer> =>
  Object.fromEntries(
    choices.flatMap((choice, index) =>
      choice === undefined ? [] : [[index, { acked: true, choice }]],
    ),
  );

const reveals = (corrects: (number | null | undefined)[]): Record<number, StoredReveal> =>
  Object.fromEntries(
    corrects.flatMap((correct, index) =>
      correct === undefined ? [] : [[index, { correct, explanation: null }]],
    ),
  );

const source = (choices: (number | undefined)[], corrects: (number | null | undefined)[]) => ({
  answers: answers(choices),
  reveals: reveals(corrects),
  sessionId: 's1',
});

describe('answerStreak', () => {
  it('ba câu đúng liên tiếp tới câu hiện tại ⇒ 3', () => {
    expect(answerStreak(source([0, 1, 2], [0, 1, 2]), 's1', 2, 2)).toBe(3);
  });

  it('một câu sai ở giữa ngắt chuỗi: chỉ đếm từ sau câu sai', () => {
    expect(answerStreak(source([0, 3, 2, 1], [0, 1, 2, 1]), 's1', 3, 1)).toBe(2);
  });

  it('câu hiện tại sai ⇒ 0 (dù trước đó đúng liền mấy câu)', () => {
    expect(answerStreak(source([0, 1, 3], [0, 1, 2]), 's1', 2, 2)).toBe(0);
  });

  it('bỏ trống câu (không chọn) ngắt chuỗi', () => {
    expect(answerStreak(source([0, undefined, 2], [0, 1, 2]), 's1', 2, 2)).toBe(1);
  });

  it('câu thiếu đáp án công bố (vào phòng muộn / mở lại app) ngắt chuỗi thay vì đoán', () => {
    expect(answerStreak(source([0, 1, 2], [0, undefined, 2]), 's1', 2, 2)).toBe(1);
  });

  it('câu công bố chưa kịp ghi vào store ⇒ dùng đáp án đúng của snapshot (`currentCorrect`)', () => {
    expect(answerStreak(source([0, 1, 2], [0, 1]), 's1', 2, 2)).toBe(3);
  });

  it('đáp án đúng là null (câu không chấm) ngắt chuỗi', () => {
    expect(answerStreak(source([0, 1], [0, null]), 's1', 1, null)).toBe(0);
  });

  it('store của phiên KHÁC ⇒ 0, không lẫn lịch sử', () => {
    expect(answerStreak({ ...source([0, 1], [0, 1]), sessionId: 'khác' }, 's1', 1, 1)).toBe(0);
  });
});
