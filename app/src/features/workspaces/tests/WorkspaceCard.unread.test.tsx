import { render, screen } from '@testing-library/react-native';

import type { WorkspaceListItem } from '../api';
import { WorkspaceCard } from '../components/WorkspaceCard';
import { listItem } from './test-utils';

/**
 * Thẻ nhóm kiểu Slack/Teams: nhắc tên và kênh chưa đọc phải đọc ra được bằng CHỮ (màu huy hiệu chỉ là phụ), tên dài được
 * 2 dòng (app.md p1-01 §7), và nhãn trợ năng của thẻ nói đủ những gì mắt thấy.
 */

const card = (patch: Partial<WorkspaceListItem>) =>
  render(
    <WorkspaceCard workspace={listItem({ status: 'ACTIVE', ...patch })} onPress={jest.fn()} />,
  );

describe('WorkspaceCard — chưa đọc / yêu thích / tên dài', () => {
  it('có nhắc tên ⇒ số + chữ "N lượt nhắc tên" (ưu tiên hơn kênh chưa đọc), nhãn trợ năng có cả hai', async () => {
    await card({ mentionCount: 2, unreadCount: 4 });

    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nhóm Toán 12, 2 lượt nhắc tên')).toBeOnTheScreen();
    expect(screen.queryByText(/kênh có tin mới/)).toBeNull();
  });

  it('chỉ có kênh chưa đọc ⇒ "N kênh có tin mới"', async () => {
    await card({ unreadCount: 3 });

    expect(screen.getByLabelText('Nhóm Toán 12, 3 kênh có tin mới')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('nhóm yêu thích + chủ nhóm ⇒ huy hiệu "Chủ nhóm", nhãn có "đã yêu thích"', async () => {
    await card({ isFavorite: true, myRole: 'OWNER' });

    expect(screen.getByText('Chủ nhóm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Nhóm Toán 12, Chủ nhóm, đã yêu thích')).toBeOnTheScreen();
  });

  it('tên dài xuống tối đa 2 dòng (không còn bị cắt ở 1 dòng)', async () => {
    const name = 'Câu lạc bộ Nghiên cứu khoa học Trường Trung học phổ thông chuyên Lê Hồng Phong';
    await card({ name });

    expect(screen.getByText(name).props.numberOfLines).toBe(2);
  });

  it('có mốc hoạt động ⇒ dòng "Hoạt động … trước"', async () => {
    await card({ lastActivityAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() });

    expect(screen.getByText(/^Hoạt động /)).toBeOnTheScreen();
  });
});
