import { fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, type TextInput } from 'react-native';

import { AUTO_GROW_LINE_HEIGHT, AutoGrowTextInput } from '@/shared/ui/auto-grow-text-input';

/**
 * `AutoGrowTextInput` (p0-12): ô nhiều dòng tự cao `minRows` → `maxRows` rồi cuộn trong ô. Jest không có bố cục thật nên chiều
 * cao được kiểm qua `style` INLINE của `TextInput` (không phải class) sau khi bắn `contentSizeChange` như native làm.
 * `render()` của RNTL 14 phải `await`.
 */
const ROW = AUTO_GROW_LINE_HEIGHT * Math.max(1, Dimensions.get('window').fontScale);
const LABEL = 'Nội dung tin nhắn';

async function grow(input: ReturnType<typeof getInput>, rows: number) {
  await fireEvent(input, 'contentSizeChange', {
    nativeEvent: { contentSize: { height: rows * ROW, width: 300 } },
  });
}
const getInput = (screen: Awaited<ReturnType<typeof render>>) => screen.getByLabelText(LABEL);
const heightOf = (input: ReturnType<typeof getInput>) =>
  StyleSheet.flatten(input.props.style as object) as { height: number };

describe('AutoGrowTextInput — chiều cao', () => {
  it('rỗng ⇒ cao đúng `minRows` (mặc định 1 dòng)', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="" onChangeText={jest.fn()} />,
    );

    expect(heightOf(getInput(screen)).height).toBe(ROW);
  });

  it('chữ dài thêm ⇒ cao thêm theo số dòng, chưa cuộn', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="a" onChangeText={jest.fn()} />,
    );
    const input = getInput(screen);

    await grow(input, 3);

    expect(heightOf(getInput(screen)).height).toBe(3 * ROW);
    expect(getInput(screen).props.scrollEnabled).toBe(false);
  });

  it('tới `maxRows` (mặc định 6) thì DỪNG cao và bật cuộn trong ô', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="a" onChangeText={jest.fn()} />,
    );

    await grow(getInput(screen), 6);
    expect(heightOf(getInput(screen)).height).toBe(6 * ROW);
    expect(getInput(screen).props.scrollEnabled).toBe(false); // vừa khít trần, chưa cần cuộn

    await grow(getInput(screen), 20);
    expect(heightOf(getInput(screen)).height).toBe(6 * ROW);
    expect(getInput(screen).props.scrollEnabled).toBe(true);
  });

  it('minRows/maxRows tuỳ chỉnh', async () => {
    const screen = await render(
      <AutoGrowTextInput
        accessibilityLabel={LABEL}
        maxRows={3}
        minRows={2}
        value=""
        onChangeText={jest.fn()}
      />,
    );

    expect(heightOf(getInput(screen)).height).toBe(2 * ROW);
    await grow(getInput(screen), 10);
    expect(heightOf(getInput(screen)).height).toBe(3 * ROW);
  });

  it('xoá bớt chữ (sau khi gửi) ⇒ co lại về `minRows`', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="a" onChangeText={jest.fn()} />,
    );

    await grow(getInput(screen), 4);
    await grow(getInput(screen), 0);

    expect(heightOf(getInput(screen)).height).toBe(ROW);
    expect(getInput(screen).props.scrollEnabled).toBe(false);
  });

  it('onHeightChange báo chiều cao ĐÃ KẸP, chỉ khi nội dung đổi', async () => {
    const onHeightChange = jest.fn();
    const screen = await render(
      <AutoGrowTextInput
        accessibilityLabel={LABEL}
        value="a"
        onChangeText={jest.fn()}
        onHeightChange={onHeightChange}
      />,
    );

    await grow(getInput(screen), 2);
    await grow(getInput(screen), 2); // lặp lại y hệt ⇒ không báo
    await grow(getInput(screen), 50);

    expect(onHeightChange.mock.calls.map(([h]) => h)).toEqual([2 * ROW, 6 * ROW]);
  });

  it('onContentSizeChange của nơi gọi vẫn được gọi (chuyển tiếp)', async () => {
    const onContentSizeChange = jest.fn();
    const screen = await render(
      <AutoGrowTextInput
        accessibilityLabel={LABEL}
        value="a"
        onChangeText={jest.fn()}
        onContentSizeChange={onContentSizeChange}
      />,
    );

    await grow(getInput(screen), 2);

    expect(onContentSizeChange).toHaveBeenCalledTimes(1);
  });
});

describe('AutoGrowTextInput — nhập liệu', () => {
  it('gõ ⇒ onChangeText nhận đúng chuỗi', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="" onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(getInput(screen), 'xin chào');

    expect(onChangeText).toHaveBeenCalledWith('xin chào');
  });

  it('đổi `value` từ NGOÀI (xoá sau khi gửi, chèn @nhắc tên) ⇒ hiện đúng, không mất ký tự', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="Nguyễn" onChangeText={jest.fn()} />,
    );
    expect(getInput(screen).props.value).toBe('Nguyễn');

    await screen.rerender(
      <AutoGrowTextInput
        accessibilityLabel={LABEL}
        value="Nguyễn Văn @An "
        onChangeText={jest.fn()}
      />,
    );
    expect(getInput(screen).props.value).toBe('Nguyễn Văn @An ');

    await screen.rerender(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="" onChangeText={jest.fn()} />,
    );
    expect(getInput(screen).props.value).toBe('');
  });

  it('Enter LUÔN xuống dòng (multiline + submitBehavior "newline") — gửi tin là việc của nút Gửi', async () => {
    const screen = await render(
      <AutoGrowTextInput accessibilityLabel={LABEL} value="" onChangeText={jest.fn()} />,
    );
    const input = getInput(screen);

    expect(input.props.multiline).toBe(true);
    expect(input.props.submitBehavior).toBe('newline');
  });

  it('có nhãn trợ năng, và chuyển ref thật của TextInput ra ngoài', async () => {
    const ref = { current: null as TextInput | null };
    const screen = await render(
      <AutoGrowTextInput ref={ref} accessibilityLabel={LABEL} value="" onChangeText={jest.fn()} />,
    );

    expect(screen.getByLabelText(LABEL)).toBeOnTheScreen();
    expect(ref.current).not.toBeNull();
  });
});
