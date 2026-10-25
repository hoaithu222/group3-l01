import { render, screen } from '@testing-library/react-native';

import type { QuizRevealDto } from '../api/live-quiz.types';
import { RevealPanel } from '../components/RevealPanel';

/**
 * Lộ đáp án: kết luận của TÔI bằng icon + chữ (một ô trợ năng đọc trọn, kèm điểm và chuỗi nếu có), tỉ lệ cả phòng chọn đúng
 * tính từ `stats`, từng phương án kèm số người chọn và thẻ "Đáp án đúng"/"Bạn chọn" (không chỉ dùng màu).
 */

const OPTIONS = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ'].map((text) => ({
  mediaAssetId: null,
  text,
}));
const REVEAL: QuizRevealDto = {
  correct: 1,
  explanation: 'Huế từng là kinh đô nhà Nguyễn.',
  index: 0,
  stats: { '0': 1, '1': 3, '2': 1, '3': 0 },
};

const panel = (props: Partial<Parameters<typeof RevealPanel>[0]> = {}) => (
  <RevealPanel myChoice={1} options={OPTIONS} reveal={REVEAL} {...props} />
);

describe('RevealPanel — kết luận của tôi', () => {
  it('đúng ⇒ "Chính xác!" + điểm vừa nhận + chuỗi, gộp thành MỘT nhãn đọc trọn', async () => {
    await render(panel({ gain: 700, streak: 3 }));

    expect(
      screen.getByLabelText('Chính xác! Bạn nhận thêm 700 điểm. Chuỗi 3 câu đúng liên tiếp.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Chính xác!')).toBeOnTheScreen();
    expect(screen.getByText('Chuỗi 3 câu đúng liên tiếp')).toBeOnTheScreen();
  });

  it('đúng nhưng chưa có điểm cộng (gain = 0) và chuỗi < 2 ⇒ không có dòng "+N" hay chuỗi (không bịa số)', async () => {
    await render(panel({ gain: 0, streak: 1 }));

    expect(screen.getByLabelText('Chính xác!')).toBeOnTheScreen();
    expect(screen.queryByText(/Chuỗi/)).toBeNull();
    expect(screen.queryByText('điểm')).toBeNull();
  });

  it('sai ⇒ "Chưa đúng", KHÔNG có điểm/chuỗi dù truyền vào', async () => {
    await render(panel({ gain: 500, myChoice: 0, streak: 4 }));

    expect(screen.getByLabelText('Chưa đúng')).toBeOnTheScreen();
    expect(screen.queryByText(/Chuỗi/)).toBeNull();
  });

  it('không trả lời ⇒ "Bạn chưa trả lời"', async () => {
    await render(panel({ myChoice: null }));

    expect(screen.getByLabelText('Bạn chưa trả lời')).toBeOnTheScreen();
  });

  it('chủ phòng (myChoice = undefined) ⇒ không có kết luận cá nhân, vẫn có số liệu cả phòng', async () => {
    await render(panel({ myChoice: undefined }));

    expect(screen.queryByText('Chính xác!')).toBeNull();
    expect(screen.queryByText('Chưa đúng')).toBeNull();
    expect(screen.getByText('60% chọn đúng (3/5 người)')).toBeOnTheScreen();
  });
});

describe('RevealPanel — từng phương án', () => {
  it('nhãn mỗi dòng: chữ cái + nội dung + số người + "Đáp án đúng"/"Bạn đã chọn"', async () => {
    await render(panel({ myChoice: 0 }));

    expect(screen.getByLabelText('B. Huế, 3 người chọn, Đáp án đúng')).toBeOnTheScreen();
    expect(screen.getByLabelText('A. Hà Nội, 1 người chọn, Bạn đã chọn')).toBeOnTheScreen();
    expect(screen.getByLabelText('D. Cần Thơ, 0 người chọn')).toBeOnTheScreen();
  });

  it('thẻ chữ: "Đáp án đúng" ở dòng đúng, "Bạn chọn" ở dòng tôi chọn (kể cả khi tôi chọn đúng)', async () => {
    await render(panel({ myChoice: 1 }));

    expect(screen.getAllByText('Đáp án đúng')).toHaveLength(1);
    expect(screen.getAllByText('Bạn chọn')).toHaveLength(1);
    expect(
      screen.getByLabelText('B. Huế, 3 người chọn, Đáp án đúng, Bạn đã chọn'),
    ).toBeOnTheScreen();
  });

  it('lời giải thích hiện trong hộp "Giải thích"; không có thì không có hộp', async () => {
    const view = await render(panel());
    expect(screen.getByText('Giải thích')).toBeOnTheScreen();
    expect(screen.getByText('Huế từng là kinh đô nhà Nguyễn.')).toBeOnTheScreen();

    await view.rerender(panel({ reveal: { ...REVEAL, explanation: null } }));
    expect(screen.queryByText('Giải thích')).toBeNull();
  });

  it('chưa ai trả lời ⇒ "Chưa có ai trả lời câu này", không chia cho 0', async () => {
    await render(panel({ reveal: { ...REVEAL, stats: {} } }));

    expect(screen.getByText('Chưa có ai trả lời câu này')).toBeOnTheScreen();
    expect(screen.getByLabelText('A. Hà Nội, 0 người chọn')).toBeOnTheScreen();
  });
});
