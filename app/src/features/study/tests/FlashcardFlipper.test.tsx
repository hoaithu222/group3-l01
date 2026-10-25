import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { FlashcardFlipper } from '../components/flashcard/FlashcardFlipper';

/**
 * Thẻ lật 3D: HAI mặt cùng nằm trong cây, nhưng trình đọc màn hình (và truy vấn của test) chỉ thấy MỘT — mặt đang ẩn bị
 * `accessibilityElementsHidden`/`importantForAccessibility`. Hoạt cảnh xoay là của Reanimated trên luồng UI (không kiểm được trong
 * Jest) — ở đây khoá phần trợ năng và hành vi chạm.
 */
const base = {
  backText: 'Định nghĩa',
  frontLines: [] as string[],
  frontText: 'Thuật ngữ',
  position: '3/20',
};

describe('FlashcardFlipper', () => {
  it('mặt trước: chỉ chữ mặt trước được truy vấn; mặt sau (đang ẩn) không', async () => {
    await render(<FlashcardFlipper {...base} flipped={false} onFlip={jest.fn()} />);

    expect(screen.getByText('Thuật ngữ')).toBeOnTheScreen();
    expect(screen.getByText('Mặt trước')).toBeOnTheScreen();
    expect(screen.queryByText('Định nghĩa')).toBeNull();
    expect(screen.queryByText('Mặt sau')).toBeNull();
  });

  it('lật: đổi phía — chỉ mặt sau được truy vấn, nhãn nút báo "thẻ 3/20, mặt sau"', async () => {
    await render(
      <FlashcardFlipper {...base} explanation="Vì sao" flipped onFlip={jest.fn()} />,
    );

    expect(screen.getByText('Định nghĩa')).toBeOnTheScreen();
    expect(screen.getByText('Vì sao')).toBeOnTheScreen();
    expect(screen.queryByText('Thuật ngữ')).toBeNull();
    expect(screen.getByLabelText('Thẻ 3/20. Mặt sau: Định nghĩa')).toBeOnTheScreen();
  });

  it('cả thẻ là MỘT nút: chạm ⇒ gọi `onFlip` đúng một lần và rung nhẹ; có gợi ý + vùng thông báo `polite`', async () => {
    const onFlip = jest.fn();
    await render(<FlashcardFlipper {...base} flipped={false} onFlip={onFlip} />);

    const card = screen.getByRole('button', { name: /^Thẻ 3\/20\. Mặt trước: Thuật ngữ$/ });
    expect(card).toHaveProp('accessibilityHint', 'Chạm hai lần để lật thẻ');
    expect(card).toHaveProp('accessibilityLiveRegion', 'polite');

    await fireEvent.press(card);

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('thẻ đã chấm trong phiên ⇒ huy hiệu trên mặt + nhãn đọc lên "Đã chọn: …"; chưa chấm thì không có', async () => {
    const { rerender } = await render(
      <FlashcardFlipper {...base} flipped={false} status="unknown" onFlip={jest.fn()} />,
    );
    expect(screen.getByText('Đã chọn: chưa thuộc')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Thẻ 3/20. Mặt trước: Thuật ngữ. Đã chọn: chưa thuộc'),
    ).toBeOnTheScreen();

    await rerender(<FlashcardFlipper {...base} flipped={false} status={null} onFlip={jest.fn()} />);
    expect(screen.queryByText(/Đã chọn/)).toBeNull();
  });

  it('trắc nghiệm: các dòng lựa chọn A/B nằm ở mặt trước, chữ đáp án ở mặt sau', async () => {
    const { rerender } = await render(
      <FlashcardFlipper
        {...base}
        backText="Hà Nội"
        flipped={false}
        frontLines={['A. Hà Nội', 'B. Huế']}
        frontText="Thủ đô?"
        onFlip={jest.fn()}
      />,
    );
    expect(screen.getByText('A. Hà Nội')).toBeOnTheScreen();
    expect(screen.getByLabelText('Thẻ 3/20. Mặt trước: Thủ đô?. A. Hà Nội. B. Huế')).toBeOnTheScreen();

    await rerender(
      <FlashcardFlipper
        {...base}
        backText="Hà Nội"
        flipped
        frontLines={['A. Hà Nội', 'B. Huế']}
        frontText="Thủ đô?"
        onFlip={jest.fn()}
      />,
    );
    expect(screen.queryByText('A. Hà Nội')).toBeNull();
    expect(screen.getByText('Hà Nội')).toBeOnTheScreen();
  });
});
