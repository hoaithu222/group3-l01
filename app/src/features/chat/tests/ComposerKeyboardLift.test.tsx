import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomSheet } from '@/shared/ui/bottom-sheet';

import { ComposerKeyboardLift } from '../components/composer/ComposerKeyboardLift';

/**
 * Chat trong tấm trượt (`MeetingChatSheet`, `RoomChatSheet`): `BottomSheet` ĐÃ nâng cả tấm lên đúng chiều cao bàn phím, nên ô soạn
 * KHÔNG được nâng thêm bằng `KeyboardStickyView` — nâng hai lần làm ô soạn trôi lên giữa danh sách tin và chừa dải trống dưới bàn phím.
 * Ngoài tấm (màn chat kênh/hội thoại) vẫn PHẢI dùng `KeyboardStickyView`.
 *
 * Bản mock chính thức của gói giữ nguyên các component; ở đây chỉ thay `KeyboardStickyView` bằng một `View` có `testID` để
 * phân biệt "được bọc" với "không được bọc" (mock gốc là `View` trơn, không có dấu hiệu nào để kiểm).
 */
jest.mock('react-native-keyboard-controller', () => {
  const actual = jest.requireActual('react-native-keyboard-controller/jest');
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    ...actual,
    KeyboardStickyView: ({ children }: { children?: ReactNode }) =>
      React.createElement(View, { testID: 'keyboard-sticky' }, children),
  };
});

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

describe('ComposerKeyboardLift', () => {
  it('ngoài tấm: nâng theo bàn phím bằng KeyboardStickyView', async () => {
    const screen = await render(
      <ComposerKeyboardLift tabBarHeight={64}>
        <Text>Ô soạn</Text>
      </ComposerKeyboardLift>,
      { wrapper: Wrapper },
    );

    expect(screen.getByTestId('keyboard-sticky')).toBeTruthy();
    expect(screen.getByText('Ô soạn')).toBeTruthy();
  });

  it('trong BottomSheet: KHÔNG dùng KeyboardStickyView (tấm đã tự nâng), nội dung vẫn hiện', async () => {
    const screen = await render(
      <BottomSheet title="Trò chuyện" visible onClose={jest.fn()}>
        <ComposerKeyboardLift tabBarHeight={0}>
          <Text>Ô soạn</Text>
        </ComposerKeyboardLift>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Ô soạn')).toBeTruthy();
    expect(screen.queryByTestId('keyboard-sticky')).toBeNull();
  });
});
