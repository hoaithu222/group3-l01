import { fireEvent, render, screen } from '@testing-library/react-native';

import { WorkspaceHubCard } from '../components/WorkspaceHubCard';
import type { WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';

/**
 * Khung "Lối vào nhanh" của tổng quan nhóm: tiêu đề (vai `header`); nơi mở hằng ngày thành Ô lưới (tên hiện, mô tả chỉ đọc
 * cho trình đọc màn hình), công cụ còn lại thành DÒNG có mô tả; bấm ô/dòng gọi đúng `onPress`; rỗng thì không vẽ gì.
 */
function entry(overrides: Partial<WorkspaceHubEntry> = {}): WorkspaceHubEntry {
  return {
    description: 'Trao đổi theo chủ đề',
    icon: 'chat-bubble',
    key: 'channels',
    label: 'Kênh',
    onPress: jest.fn(),
    tone: 'info',
    ...overrides,
  };
}

const wallet = (onPress = jest.fn()) =>
  entry({ description: 'Chia tiền', icon: 'money', key: 'wallet', label: 'Ví', onPress, tone: 'success' });
const mentor = (onPress = jest.fn()) =>
  entry({ description: 'Đăng bài tìm cố vấn', icon: 'support', key: 'mentor', label: 'Tìm cố vấn', onPress, tone: 'warning' });

describe('WorkspaceHubCard', () => {
  it('có tiêu đề "Lối vào nhanh" (vai header); bấm ô gọi đúng onPress', async () => {
    const onPress = jest.fn();
    await render(<WorkspaceHubCard entries={[entry({ onPress }), wallet()]} />);

    expect(screen.getByRole('header', { name: 'Lối vào nhanh' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Kênh. Trao đổi theo chủ đề'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ô lưới: mô tả KHÔNG in ra màn nhưng có trong nhãn trợ năng, kèm số chưa đọc', async () => {
    await render(<WorkspaceHubCard entries={[entry({ badge: 3 }), wallet()]} />);

    expect(screen.queryByText('Trao đổi theo chủ đề')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kênh. Trao đổi theo chủ đề, 3 chưa đọc' })).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('công cụ ngoài lưới (Tìm cố vấn) là DÒNG có mô tả, đứng dưới lưới; bấm dòng gọi đúng onPress', async () => {
    const onMentor = jest.fn();
    await render(<WorkspaceHubCard entries={[entry(), wallet(), mentor(onMentor)]} />);

    expect(screen.getByText('Đăng bài tìm cố vấn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tìm cố vấn'));
    expect(onMentor).toHaveBeenCalledTimes(1);
  });

  it('chỉ một mục thuộc lưới (vd khách chỉ có "Kênh") ⇒ không dựng lưới một ô: mọi mục thành dòng có mô tả', async () => {
    await render(<WorkspaceHubCard entries={[entry(), mentor()]} />);

    expect(screen.getByText('Trao đổi theo chủ đề')).toBeOnTheScreen();
    expect(screen.getByText('Đăng bài tìm cố vấn')).toBeOnTheScreen();
  });

  it('không có lối vào nào ⇒ không vẽ khung (kể cả tiêu đề)', async () => {
    await render(<WorkspaceHubCard entries={[]} />);

    expect(screen.queryByText('Lối vào nhanh')).toBeNull();
  });
});
