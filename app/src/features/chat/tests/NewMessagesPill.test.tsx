import { fireEvent, render, screen } from '@testing-library/react-native';

import { NewMessagesPill } from '../components/list/NewMessagesPill';

/**
 * Viên thuốc "Có N tin mới": không có tin mới thì KHÔNG vẽ gì; có thì là MỘT nút nói rõ việc nó làm (cuộn xuống), và số quá
 * lớn thì bỏ con số ("Có tin mới") thay vì để chữ tràn viên thuốc.
 */

describe('NewMessagesPill', () => {
  it('không có tin mới (0) ⇒ không vẽ gì', async () => {
    await render(<NewMessagesPill count={0} onPress={jest.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('có tin mới ⇒ một nút có nhãn nói rõ việc nó làm; bấm gọi onPress', async () => {
    const onPress = jest.fn();
    await render(<NewMessagesPill count={3} onPress={onPress} />);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Có 3 tin mới, cuộn xuống tin mới nhất' }),
    );

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Có 3 tin mới')).toBeOnTheScreen();
  });

  it('hơn 99 tin ⇒ không hiện con số', async () => {
    await render(<NewMessagesPill count={250} onPress={jest.fn()} />);

    expect(screen.getByText('Có tin mới')).toBeOnTheScreen();
    expect(screen.queryByText(/250/)).toBeNull();
  });
});
