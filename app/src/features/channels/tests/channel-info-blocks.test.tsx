import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ChannelDetail } from '../api';
import { ChannelDangerZoneCard } from '../components/ChannelDangerZoneCard';
import { ChannelInfoHero } from '../components/ChannelInfoHero';

/**
 * Hai khối của màn Thông tin kênh: đầu trang (tên · loại · hiển thị · số thành viên — trạng thái bằng CHỮ, không chỉ màu) và
 * khối "Nguy hiểm" dạng hàng (không còn cụm nút đỏ đầy bề ngang; không hàng nào hiện thì không vẽ cả khối).
 */
function channel(patch: Partial<ChannelDetail> = {}): ChannelDetail {
  return {
    createdBy: 'u-1',
    description: null,
    id: 'ch-1',
    isDefault: false,
    lastMessageAt: null,
    memberCount: 7,
    myPermissions: {
      canArchive: true,
      canLeave: true,
      canManage: true,
      canManageGrants: false,
      canModerate: false,
      canPin: true,
      canReact: true,
      canWrite: true,
    },
    name: 'thiet-ke',
    notifyMode: 'INHERIT',
    pinned: false,
    position: 0,
    postingPolicy: 'MEMBERS',
    status: 'ACTIVE',
    type: 'TEXT',
    version: 1,
    visibility: 'PRIVATE',
    ...patch,
  };
}

describe('ChannelInfoHero', () => {
  it('hiện tên, loại, hiển thị và số thành viên bằng chữ; thiếu mô tả thì nói rõ', async () => {
    await render(<ChannelInfoHero channel={channel()} />);

    expect(screen.getByText('thiet-ke')).toBeOnTheScreen();
    expect(screen.getByText('Kênh chữ')).toBeOnTheScreen();
    expect(screen.getByText('Riêng tư')).toBeOnTheScreen();
    expect(screen.getByText('7 thành viên')).toBeOnTheScreen();
    expect(screen.getByText('Chưa có mô tả')).toBeOnTheScreen();
  });

  it('kênh mặc định + đã lưu trữ ⇒ có huy hiệu chữ cho cả hai', async () => {
    await render(<ChannelInfoHero channel={channel({ isDefault: true, status: 'ARCHIVED' })} />);

    expect(screen.getByText('Kênh mặc định')).toBeOnTheScreen();
    expect(screen.getByText('Đã lưu trữ')).toBeOnTheScreen();
  });
});

describe('ChannelDangerZoneCard', () => {
  const handlers = () => ({ onArchive: jest.fn(), onLeave: jest.fn(), onRestore: jest.fn() });

  it('kênh đang hoạt động: bấm "Lưu trữ kênh" / "Rời kênh" gọi đúng việc (màn cha mới hỏi xác nhận)', async () => {
    const on = handlers();
    await render(<ChannelDangerZoneCard channel={channel()} restoreLoading={false} {...on} />);

    await fireEvent.press(screen.getByText('Lưu trữ kênh'));
    await fireEvent.press(screen.getByText('Rời kênh'));
    expect(on.onArchive).toHaveBeenCalledTimes(1);
    expect(on.onLeave).toHaveBeenCalledTimes(1);
  });

  it('kênh mặc định, không quyền lưu trữ ⇒ không vẽ cả khối (không còn thẻ "Nguy hiểm" rỗng)', async () => {
    const base = channel({ isDefault: true });
    await render(
      <ChannelDangerZoneCard
        channel={{ ...base, myPermissions: { ...base.myPermissions, canArchive: false } }}
        restoreLoading={false}
        {...handlers()}
      />,
    );

    expect(screen.queryByText('Nguy hiểm')).toBeNull();
  });

  it('đang khôi phục ⇒ hàng khoá, bấm không gọi lại', async () => {
    const on = handlers();
    await render(
      <ChannelDangerZoneCard channel={channel({ status: 'ARCHIVED' })} restoreLoading {...on} />,
    );

    await fireEvent.press(screen.getByText('Khôi phục kênh'));
    expect(on.onRestore).not.toHaveBeenCalled();
    expect(screen.getByText('Đang khôi phục…')).toBeOnTheScreen();
  });
});
