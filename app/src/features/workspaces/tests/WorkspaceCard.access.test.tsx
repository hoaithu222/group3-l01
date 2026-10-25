import { fireEvent, render, screen } from '@testing-library/react-native';

import type { WorkspaceListItem } from '../api';
import { WorkspaceCard } from '../components/WorkspaceCard';

/**
 * Thẻ nhóm trong danh sách (app.md p3-04 §3): YÊU CẦU chờ duyệt và tư cách KHÁCH phải nhìn ra
 * ngay từ danh sách — bằng chữ, và trình đọc màn hình nghe được cả hai.
 */

const DAY = 24 * 60 * 60 * 1000;

function item(patch: Partial<WorkspaceListItem>): WorkspaceListItem {
  return {
    id: 'ws-1',
    name: 'Nhóm Toán 12',
    avatarUrl: null,
    coverUrl: null,
    coverThumbUrl: null,
    coverPreset: null,
    descriptionShort: null,
    status: 'ACTIVE',
    myRole: 'MEMBER',
    isFavorite: false,
    position: null,
    unreadCount: 0,
    mentionCount: 0,
    unreadAvailable: false,
    lastActivityAt: '',
    ...patch,
  };
}

describe('WorkspaceCard — p3-04', () => {
  it('status PENDING → "Đang chờ duyệt" (chữ + nhãn trợ năng)', async () => {
    await render(<WorkspaceCard workspace={item({ status: 'PENDING' })} onPress={jest.fn()} />);

    expect(screen.getByText('Đang chờ duyệt')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nhóm Toán 12, đang chờ duyệt')).toBeOnTheScreen();
  });

  it('mình là KHÁCH còn 5 ngày → "Khách · còn 5 ngày"', async () => {
    await render(
      <WorkspaceCard
        workspace={item({ myRole: 'GUEST', myExpiresAt: new Date(Date.now() + 5 * DAY).toISOString() })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Khách · còn 5 ngày')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nhóm Toán 12, Khách · còn 5 ngày')).toBeOnTheScreen();
  });

  it('khách mà BE chưa gửi hạn → chỉ "Khách" (không bịa ngày)', async () => {
    await render(<WorkspaceCard workspace={item({ myRole: 'GUEST' })} onPress={jest.fn()} />);

    expect(screen.getByText('Khách')).toBeOnTheScreen();
  });

  it('thành viên thường / nhóm đang hoạt động → không thêm dòng phụ nào', async () => {
    await render(<WorkspaceCard workspace={item({})} onPress={jest.fn()} />);

    expect(screen.queryByText('Đang chờ duyệt')).toBeNull();
    expect(screen.queryByText(/Khách/)).toBeNull();
  });

  it('bấm thẻ gọi onPress với đúng nhóm (nơi gọi quyết mở màn chờ hay tổng quan)', async () => {
    const onPress = jest.fn();
    const workspace = item({ status: 'PENDING' });
    await render(<WorkspaceCard workspace={workspace} onPress={onPress} />);

    await fireEvent.press(screen.getByText('Nhóm Toán 12'));

    expect(onPress).toHaveBeenCalledWith(workspace);
  });
});
