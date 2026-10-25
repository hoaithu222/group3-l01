import { fireEvent, screen } from '@testing-library/react-native';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { AcceptMentorSheet } from '../components/AcceptMentorSheet';
import { renderWithProviders } from './render-helpers';

/** app.md p6-03 §8 — `AcceptMentorSheet` mặc định chọn kênh "Chung" (isDefault) + BẬT nhóm chat + 30 ngày. */
jest.mock('../api/mentor-engagements.service', () => ({
  mentorEngagementsService: { channelOptions: jest.fn(), memberOptions: jest.fn() },
}));

const api = jest.mocked(mentorEngagementsService);

beforeEach(() => {
  jest.clearAllMocks();
  api.channelOptions.mockResolvedValue([
    { id: 'kenh-chung', isDefault: true, name: 'Chung', visibility: 'PUBLIC' },
    { id: 'kenh-rieng', isDefault: false, name: 'Bí mật', visibility: 'PRIVATE' },
  ]);
  api.memberOptions.mockResolvedValue([{ name: 'Thành viên A', role: 'MEMBER', userId: 'tv-a' }]);
});

async function renderSheet(props: Partial<Parameters<typeof AcceptMentorSheet>[0]> = {}) {
  const onSubmit = jest.fn();
  await renderWithProviders(
    <AcceptMentorSheet
      applicantName="Cố vấn X"
      postVersion={3}
      visible
      wsId="ws-1"
      onClose={jest.fn()}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

describe('AcceptMentorSheet', () => {
  it('mặc định: kênh Chung được chọn, nhóm chat BẬT, 30 ngày → gửi đúng payload (kèm expectedPostVersion)', async () => {
    const onSubmit = await renderSheet();
    expect(await screen.findByText('# Chung · mặc định')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Tạo nhóm chat với cố vấn' })).toBeChecked();

    await fireEvent.press(screen.getByText('Chấp nhận cố vấn'));
    expect(onSubmit).toHaveBeenCalledWith({
      channelIds: ['kenh-chung'],
      createConversation: true,
      durationDays: 30,
      expectedPostVersion: 3,
      includeMemberIds: [],
    });
  });

  it('tắt nhóm chat → ẩn danh sách thành viên kèm theo, gửi createConversation=false; chọn 14 ngày', async () => {
    const onSubmit = await renderSheet();
    expect(await screen.findByText('Thành viên A')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('switch', { name: 'Tạo nhóm chat với cố vấn' }));
    expect(screen.queryByText('Thành viên A')).toBeNull();
    await fireEvent.press(screen.getByText('14 ngày'));
    await fireEvent.press(screen.getByText('Chấp nhận cố vấn'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        createConversation: false,
        durationDays: 14,
        includeMemberIds: [],
      }),
    );
  });

  it('kênh BE từ chối (MENTOR_008) được đánh dấu bằng chữ + lỗi hiện trong tấm', async () => {
    await renderSheet({
      errorMessage: 'Kênh được chọn không hợp lệ',
      invalidChannelIds: ['kenh-rieng'],
    });
    expect(await screen.findByText('# Bí mật · riêng tư · không chọn được')).toBeOnTheScreen();
    expect(screen.getByText('Kênh được chọn không hợp lệ')).toBeOnTheScreen();
  });
});
