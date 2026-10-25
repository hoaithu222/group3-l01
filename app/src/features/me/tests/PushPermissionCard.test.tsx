import { render, screen, userEvent } from '@testing-library/react-native';

import { PushPermissionCard } from '../components/PushPermissionCard';

/**
 * Thẻ trạng thái quyền thông báo (đầu màn Thông báo): mỗi trạng thái có nhãn chữ + đúng một nút hành động (hoặc không có),
 * KHÔNG dựa vào màu. Chỉ test HÀNH VI — NativeWind không có trong Jest nên tông màu/icon không kiểm được.
 */

async function renderCard(permission: 'denied' | 'granted' | 'undetermined' | null) {
  const onEnable = jest.fn();
  const onOpenSettings = jest.fn();
  await render(
    <PushPermissionCard permission={permission} onEnable={onEnable} onOpenSettings={onOpenSettings} />,
  );
  return { onEnable, onOpenSettings };
}

describe('PushPermissionCard', () => {
  it('đã bật: chỉ báo "Đang bật", không nút hành động nào', async () => {
    await renderCard('granted');

    expect(screen.getByText('Đang bật')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Bật thông báo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mở Cài đặt hệ thống' })).toBeNull();
  });

  it('chưa hỏi: nút "Bật thông báo" gọi onEnable (hộp thoại hệ thống), không mở Cài đặt', async () => {
    const { onEnable, onOpenSettings } = await renderCard('undetermined');

    expect(screen.getByText('Chưa bật')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Bật thông báo' }));
    expect(onEnable).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('đã từ chối: nói rõ nguyên nhân + nút mở Cài đặt hệ thống, không hộp thoại lặp (PUSH-11)', async () => {
    const { onEnable, onOpenSettings } = await renderCard('denied');

    expect(screen.getByText('Đang tắt')).toBeOnTheScreen();
    expect(screen.getByText(/Đang tắt trong Cài đặt hệ thống/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt hệ thống' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('chưa biết quyền (null): khung xương, không chữ trạng thái và không nút', async () => {
    await renderCard(null);

    expect(screen.queryByText('Thông báo đẩy')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
