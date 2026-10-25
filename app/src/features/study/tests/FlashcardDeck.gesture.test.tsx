import { act, fireEvent, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { studyService } from '../api/study.service';
import { FlashcardStudyScreen } from '../screens/FlashcardStudyScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * Vuốt để chấm thẻ (Học thẻ): vuốt PHẢI = đã thuộc, TRÁI = chưa thuộc, chưa đủ ngưỡng thì thẻ ở lại. Cử chỉ chạy thật qua
 * `fireGestureHandler` của gesture-handler + Reanimated thật (bay ra 200 ms rồi mới chấm) — nên chờ bằng `findBy*`.
 *
 * ⚠️ Vẫn CHƯA phải bằng chứng trên máy: Jest không có luồng UI thật, không đo được `onLayout` (bề rộng = 0 ⇒ ngưỡng lấy sàn 72dp), và
 * không thấy hoạt cảnh. Chỉ khoá LOGIC: ai được chấm, khi nào, không chấm đôi.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('../api/study.service', () => ({ studyService: { get: jest.fn(), items: jest.fn() } }));

const mocked = jest.mocked(studyService);
const PAN = 'flashcard-deck-pan';
const settle = (ms: number) => act(async () => void (await new Promise<void>((resolve) => setTimeout(resolve, ms))));

/** Một cú vuốt: chạm → kéo dần → thả với quãng đường `dx` và vận tốc `vx`. */
async function swipe(dx: number, vx = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(PAN), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: 0 },
      { translationX: dx / 2, translationY: 4 },
      { state: State.END, translationX: dx, translationY: 6, velocityX: vx },
    ]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [
      makeItem({ id: 'i1', order: 1 }),
      makeChoiceItem({ id: 'i2', order: 2 }),
      makeItem({ id: 'i3', order: 3, prompt: 'Thẻ ba' }),
    ],
    setVersion: 3,
  });
});

describe('vuốt để chấm thẻ', () => {
  it('vuốt PHẢI quá ngưỡng ⇒ "đã thuộc" và sang thẻ kế; số đếm đổi theo', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    expect(await screen.findByText('1/3')).toBeOnTheScreen();
    expect(screen.getByText('0 đã thuộc')).toBeOnTheScreen();

    await swipe(150);

    expect(await screen.findByText('2/3')).toBeOnTheScreen();
    expect(screen.getByText('1 đã thuộc')).toBeOnTheScreen();
    expect(screen.getByText('0 chưa thuộc')).toBeOnTheScreen();
  });

  it('vuốt TRÁI quá ngưỡng ⇒ "chưa thuộc"', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(-150);

    expect(await screen.findByText('2/3')).toBeOnTheScreen();
    expect(screen.getByText('1 chưa thuộc')).toBeOnTheScreen();
    expect(screen.getByText('0 đã thuộc')).toBeOnTheScreen();
  });

  it('vuốt ngắn (chưa tới ngưỡng) ⇒ thẻ ở lại, KHÔNG chấm gì', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(30, 100);
    await settle(400);

    expect(screen.getByText('1/3')).toBeOnTheScreen();
    expect(screen.getByText('0 đã thuộc')).toBeOnTheScreen();
    expect(screen.getByText('0 chưa thuộc')).toBeOnTheScreen();
  });

  it('hất NHANH (chưa đủ quãng đường) vẫn chấm; hất nhanh NGƯỢC chiều thì không', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(-40, 1500); // kéo trái ngắn nhưng hất sang phải — hai chiều ngược nhau ⇒ không quyết định
    await settle(400);
    expect(screen.getByText('1/3')).toBeOnTheScreen();

    await swipe(40, 1500);
    expect(await screen.findByText('2/3')).toBeOnTheScreen();
    expect(screen.getByText('1 đã thuộc')).toBeOnTheScreen();
  });

  it('bấm nút KHI thẻ đang bay ⇒ không chấm đôi (thẻ kế không bị bỏ qua)', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(150);
    // Thẻ đang bay (200 ms): bấm "Chưa thuộc" lúc này phải bị bỏ qua, nếu không thẻ 2 bị chấm nhầm.
    await fireEvent.press(screen.getByText('Chưa thuộc'));
    await settle(500);

    expect(screen.getByText('2/3')).toBeOnTheScreen();
    expect(screen.getByText('1 đã thuộc')).toBeOnTheScreen();
    expect(screen.getByText('0 chưa thuộc')).toBeOnTheScreen();
  });

  it('bấm nút "Đã thuộc" cùng lối với vuốt: bay ra rồi chấm; bấm hai lần liên tiếp chỉ chấm MỘT thẻ', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await fireEvent.press(screen.getByText('Đã thuộc'));
    await fireEvent.press(screen.getByText('Đã thuộc'));

    expect(await screen.findByText('2/3')).toBeOnTheScreen();
    await settle(500);
    expect(screen.getByText('2/3')).toBeOnTheScreen();
    expect(screen.getByText('1 đã thuộc')).toBeOnTheScreen();
  });

  it('xem lại thẻ đã chấm bằng "Trước" ⇒ huy hiệu + nhãn thẻ nhắc đã chọn gì', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(150);
    await screen.findByText('2/3');
    await fireEvent.press(screen.getByLabelText('Thẻ trước'));

    expect(await screen.findByText('1/3')).toBeOnTheScreen();
    // Huy hiệu nằm trên cả hai mặt (chỉ mặt đang hiện được tính) và nhãn thẻ đọc lên cả trạng thái.
    expect(screen.getByText('Đã chọn: thuộc')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Thẻ 1\/3\. Mặt trước: Thuật ngữ\. Đã chọn: thuộc$/)).toBeOnTheScreen();
  });

  it('vuốt hết bộ ⇒ màn tóm tắt: vòng "đã thuộc" theo số thẻ đã chấm, thẻ bỏ qua có ô riêng', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(150);
    await screen.findByText('2/3');
    await swipe(-150);
    await screen.findByText('3/3');
    await fireEvent.press(screen.getByLabelText('Thẻ sau')); // thẻ cuối đi qua mà không chấm

    expect(await screen.findByText('Hoàn thành!')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đã thuộc 1 trên 3 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đã thuộc: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Chưa thuộc: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bỏ qua: 1 thẻ')).toBeOnTheScreen();
    expect(screen.getByText('33%')).toBeOnTheScreen();
  });

  it('đổi thẻ bằng "Sau" giữa lúc thẻ đang bay ⇒ thẻ vừa bỏ đi KHÔNG bị chấm', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/3');

    await swipe(150);
    await fireEvent.press(screen.getByLabelText('Thẻ sau')); // đổi thẻ trước khi hoạt cảnh bay xong
    await settle(500);

    expect(screen.getByText('0 đã thuộc')).toBeOnTheScreen();
    expect(screen.getByText('0 chưa thuộc')).toBeOnTheScreen();
  });
});
