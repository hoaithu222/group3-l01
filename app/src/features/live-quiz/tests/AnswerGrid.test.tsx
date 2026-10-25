import { fireEvent, render, screen } from '@testing-library/react-native';

import { AnswerGrid } from '../components/AnswerGrid';

/**
 * Lưới ô đáp án: mỗi ô là MỘT nút mang nhãn "A. nội dung" (chữ cái + hình khối là hình vẽ, ẩn khỏi trình đọc màn hình);
 * khoá cả bảng thì ô không phải ô đã chọn bị khoá; không có `onChoose` ⇒ bảng CHỈ ĐỂ XEM (màn của chủ phòng).
 */

const OPTIONS = ['Hà Nội', 'Huế', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng'].map((text) => ({
  mediaAssetId: null,
  text,
}));

describe('AnswerGrid', () => {
  it('mỗi ô là một nút có nhãn "chữ cái + nội dung"; bấm ô gọi onChoose đúng chỉ số', async () => {
    const onChoose = jest.fn();
    await render(<AnswerGrid options={OPTIONS} onChoose={onChoose} />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    await fireEvent.press(screen.getByRole('button', { name: 'E. Hải Phòng' }));

    expect(onChoose).toHaveBeenCalledWith(4);
  });

  it('ô đã chọn báo `selected` cho trình đọc màn hình; khoá ⇒ các ô khác bị khoá, ô đã chọn thì không', async () => {
    await render(<AnswerGrid locked options={OPTIONS} selected={1} onChoose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'B. Huế' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'B. Huế' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'A. Hà Nội' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'A. Hà Nội' })).not.toBeSelected();
  });

  it('khoá thì bấm ô đã chọn cũng KHÔNG gọi onChoose (một đáp án mỗi người mỗi câu)', async () => {
    const onChoose = jest.fn();
    await render(<AnswerGrid locked options={OPTIONS} selected={1} onChoose={onChoose} />);

    await fireEvent.press(screen.getByRole('button', { name: 'B. Huế' }));

    expect(onChoose).not.toHaveBeenCalled();
  });

  it('đang gửi ⇒ ô đang chờ báo `busy`', async () => {
    await render(
      <AnswerGrid loadingIndex={2} locked options={OPTIONS} selected={2} onChoose={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'C. Đà Nẵng' })).toBeBusy();
  });

  it('không có onChoose ⇒ chỉ để xem: không có nút nào nhưng đủ nhãn từng đáp án', async () => {
    await render(<AnswerGrid options={OPTIONS} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    ['A. Hà Nội', 'B. Huế', 'C. Đà Nẵng', 'D. Cần Thơ', 'E. Hải Phòng'].forEach((label) =>
      expect(screen.getByLabelText(label)).toBeOnTheScreen(),
    );
  });

  it('đáp án dài (một cột) vẫn dựng đủ và bấm được', async () => {
    const long = [
      {
        mediaAssetId: null,
        text: 'Đây là một đáp án rất dài, dài hơn hẳn giới hạn ký tự của ô lưới hai cột',
      },
      { mediaAssetId: null, text: 'Ngắn' },
    ];
    const onChoose = jest.fn();
    await render(<AnswerGrid options={long} onChoose={onChoose} />);

    await fireEvent.press(screen.getAllByRole('button')[0] as never);

    expect(onChoose).toHaveBeenCalledWith(0);
  });
});
