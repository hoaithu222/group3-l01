import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Dimensions } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import type * as ReactNative from 'react-native';

import { MeetingChatSheet } from '../../../components/chat/MeetingChatSheet';
import { renderWithProviders } from '../prejoin/render-helpers';

/**
 * Chiều cao tấm chat theo bàn phím: `BottomSheet` nâng tấm bằng đệm đáy = chiều cao bàn phím, nên tấm cao cố định 85% phải CO lại — không thì
 * hàng tiêu đề + nút ✕ bị đẩy khỏi mép trên lúc đang gõ. `BottomSheet` được thay bằng bản ghi lại `height` (hợp đồng prop, không đo Yoga).
 */
let mockSheetHeight: number | undefined;

jest.mock('@/shared/ui/bottom-sheet', () => {
  const { View } = jest.requireActual<typeof ReactNative>('react-native');
  return {
    BottomSheet: ({ children, height }: { children: ReactNode; height?: number }) => {
      mockSheetHeight = height;
      return <View>{children}</View>;
    },
  };
});
jest.mock('@/core/socket', () => ({ useRoomSubscription: jest.fn(() => ({ status: 'joined' })) }));
jest.mock('@/features/chat', () => ({ ChatRoom: () => null, useChatScope: () => ({}) }));

/** `render-helpers` đặt vùng an toàn trên = 44. */
const TOP_INSET = 44;
const windowHeight = (): number => Dimensions.get('window').height;
const keyboard = (height: number) =>
  jest
    .mocked(useKeyboardState)
    .mockImplementation(((selector?: (state: { height: number; isVisible: boolean }) => unknown) =>
      selector
        ? selector({ height, isVisible: height > 0 })
        : { height, isVisible: height > 0 }) as typeof useKeyboardState);

const renderSheet = () =>
  renderWithProviders(
    <MeetingChatSheet
      canCreate={false}
      conversationId={null}
      meetingId="m1"
      visible
      onClose={jest.fn()}
    />,
  );

beforeEach(() => {
  mockSheetHeight = undefined;
});

describe('MeetingChatSheet — chiều cao theo bàn phím', () => {
  it('bàn phím đóng: 85% chiều cao màn', async () => {
    keyboard(0);
    await renderSheet();

    expect(screen.getByText('Chủ trì chưa bật chat')).toBeOnTheScreen();
    expect(mockSheetHeight).toBe(Math.round(windowHeight() * 0.85));
  });

  it('bàn phím mở: tấm co vừa phần trống phía trên bàn phím (trừ vùng an toàn trên + khe 8)', async () => {
    keyboard(300);
    await renderSheet();

    expect(mockSheetHeight).toBe(
      Math.min(Math.round(windowHeight() * 0.85), Math.round(windowHeight() - 300 - TOP_INSET - 8)),
    );
    expect(mockSheetHeight).toBeLessThan(Math.round(windowHeight() * 0.85));
  });

  it('bàn phím quá cao (máy thấp/xoay ngang): không co dưới sàn 240dp', async () => {
    keyboard(windowHeight());
    await renderSheet();

    expect(mockSheetHeight).toBe(240);
  });
});
