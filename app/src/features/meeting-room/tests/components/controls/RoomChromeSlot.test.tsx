import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { RoomChromeSlot } from '../../../components/controls/RoomChromeSlot';

/**
 * Khe chứa tiêu đề/thanh điều khiển: ẩn = mờ tại chỗ (VẪN mount, chỗ giữ nguyên ⇒ sân khấu không đổi kích thước), không bấm được, ẩn khỏi
 * trình đọc màn hình. ⚠️ Độ mờ/vị trí là hoạt ảnh Reanimated — Jest chỉ kiểm cây, trợ năng và việc chặn chạm.
 */
function Probe({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Nút thử" accessibilityRole="button" onPress={onPress}>
      <Text>Nút thử</Text>
    </Pressable>
  );
}

describe('RoomChromeSlot', () => {
  it('hiện: nút bên trong bấm được và trình đọc màn hình thấy', async () => {
    const onPress = jest.fn();
    await render(
      <RoomChromeSlot edge="bottom" visible>
        <Probe onPress={onPress} />
      </RoomChromeSlot>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Nút thử' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ẩn: VẪN mount (không gỡ khỏi bố cục) nhưng ẩn khỏi trình đọc màn hình và KHÔNG nhận chạm', async () => {
    const onPress = jest.fn();
    await render(
      <RoomChromeSlot edge="top" visible={false}>
        <Probe onPress={onPress} />
      </RoomChromeSlot>,
    );

    expect(screen.queryByRole('button', { name: 'Nút thử' })).toBeNull();
    const hiddenButton = screen.getByRole('button', {
      includeHiddenElements: true,
      name: 'Nút thử',
    });
    expect(hiddenButton).toBeOnTheScreen();
    await fireEvent.press(hiddenButton);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hiện lại sau khi ẩn: cùng một nút (state bên trong giữ nguyên), bấm lại được', async () => {
    const onPress = jest.fn();
    const view = await render(
      <RoomChromeSlot edge="bottom" visible={false}>
        <Probe onPress={onPress} />
      </RoomChromeSlot>,
    );
    await view.rerender(
      <RoomChromeSlot edge="bottom" visible>
        <Probe onPress={onPress} />
      </RoomChromeSlot>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Nút thử' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
