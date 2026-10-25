import { fireEvent, screen } from '@testing-library/react-native';

import { LobbyPanel, type LobbyPanelProps } from '../../../components/people/LobbyPanel';
import { makeLobbyEntry } from '../../fixtures';
import { renderWithProviders } from '../prejoin/render-helpers';

/** `LobbyPanel` (app.md p2-05 §3.2): cho vào/từ chối từng người, "Cho tất cả vào" từ hai người, loading TỪNG hàng. */

function makeProps(over: Partial<LobbyPanelProps> = {}): LobbyPanelProps {
  return {
    entries: [makeLobbyEntry('u1', { displayName: 'Lan' }), makeLobbyEntry('u2', { displayName: 'Bình' })],
    onAdmit: jest.fn(),
    onAdmitAll: jest.fn(),
    onDeny: jest.fn(),
    ...over,
  };
}

describe('LobbyPanel', () => {
  it('rỗng: "Chưa có ai chờ" và đếm 0, không có nút nào', async () => {
    await renderWithProviders(<LobbyPanel {...makeProps({ entries: [] })} />);

    expect(screen.getByText('Chưa có ai chờ')).toBeOnTheScreen();
    expect(screen.getByText('Đang chờ vào (0)')).toBeOnTheScreen();
    expect(screen.queryByText('Cho tất cả vào')).toBeNull();
  });

  it('cho vào / từ chối đúng người (nhãn nêu tên để phân biệt các hàng)', async () => {
    const props = makeProps();
    await renderWithProviders(<LobbyPanel {...props} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Cho Bình vào' }));
    expect(props.onAdmit).toHaveBeenCalledWith('u2');
    await fireEvent.press(screen.getByRole('button', { name: 'Từ chối Lan' }));
    expect(props.onDeny).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Đang chờ vào (2)')).toBeOnTheScreen();
  });

  it('"Cho tất cả vào" chỉ khi có từ hai người; đang gọi thì báo busy', async () => {
    const one = makeProps({ entries: [makeLobbyEntry('u1')] });
    const { rerender } = await renderWithProviders(<LobbyPanel {...one} />);
    expect(screen.queryByText('Cho tất cả vào')).toBeNull();

    const two = makeProps({ admitAllPending: true });
    await rerender(<LobbyPanel {...two} />);
    const all = screen.getByRole('button', { name: 'Cho tất cả vào' });
    expect(all).toBeBusy();
    await fireEvent.press(all);
    expect(two.onAdmitAll).not.toHaveBeenCalled();
  });

  it('gọi API cho MỘT người: hàng đó khoá cả hai nút, hàng kia vẫn bấm được', async () => {
    const props = makeProps({ pendingUserIds: ['u1'] });
    await renderWithProviders(<LobbyPanel {...props} />);

    expect(screen.getByRole('button', { name: 'Cho Lan vào' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Từ chối Lan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cho Bình vào' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Từ chối Bình' })).toBeEnabled();
  });
});
