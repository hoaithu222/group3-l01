import { act, fireEvent, screen } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { studyService } from '../api/study.service';
import { FlashcardStudyScreen } from '../screens/FlashcardStudyScreen';
import { makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/**
 * "Giảm chuyển động" của hệ điều hành BẬT (ST-26): thẻ KHÔNG bay/nghiêng/lò xo, nhấc tay (hoặc bấm nút) là chấm NGAY — kiểm bằng
 * `getBy*` đồng bộ ngay sau thao tác (bản có chuyển động phải chờ ~200 ms bay ra, xem `FlashcardDeck.gesture.test.tsx`). Lật thẻ
 * vẫn hoạt động (chuyển mờ 150 ms thay xoay).
 */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => true,
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('../api/study.service', () => ({ studyService: { get: jest.fn(), items: jest.fn() } }));

const mocked = jest.mocked(studyService);

async function swipe(dx: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('flashcard-deck-pan'), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: 0 },
      { translationX: dx / 2 },
      { state: State.END, translationX: dx, velocityX: 0 },
    ]);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeItem({ id: 'i2', order: 2, prompt: 'Thẻ hai' })],
    setVersion: 3,
  });
});

describe('Học thẻ khi bật "Giảm chuyển động"', () => {
  it('vuốt phải ⇒ chấm NGAY, không chờ thẻ bay ra', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/2');

    await swipe(150);

    expect(screen.getByText('2/2')).toBeOnTheScreen();
    expect(screen.getByText('1 đã thuộc')).toBeOnTheScreen();
  });

  it('bấm "Chưa thuộc" ⇒ chấm NGAY', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/2');

    await fireEvent.press(screen.getByText('Chưa thuộc'));

    expect(screen.getByText('2/2')).toBeOnTheScreen();
    expect(screen.getByText('1 chưa thuộc')).toBeOnTheScreen();
  });

  it('vuốt ngắn vẫn không chấm', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await screen.findByText('1/2');

    await swipe(20);

    expect(screen.getByText('1/2')).toBeOnTheScreen();
    expect(screen.getByText('0 đã thuộc')).toBeOnTheScreen();
  });

  it('lật thẻ vẫn chạy (chuyển mờ, không xoay): nhãn đổi sang mặt sau và ngược lại', async () => {
    await renderWithProviders(<FlashcardStudyScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Thẻ 1\/2\. Mặt trước/));
    expect(screen.getByLabelText(/^Thẻ 1\/2\. Mặt sau: Định nghĩa/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText(/^Thẻ 1\/2\. Mặt sau/));
    expect(screen.getByLabelText(/^Thẻ 1\/2\. Mặt trước/)).toBeOnTheScreen();
  });
});
