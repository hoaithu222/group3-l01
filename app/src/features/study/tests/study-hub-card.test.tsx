import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { studyService } from '../api/study.service';
import { StudyHubCard } from '../components/StudyHubCard';
import { renderWithProviders } from './render-helpers';

/** Mục "Học" của hub nhóm: MỘT hàng có mũi tên + tối đa MỘT hành động phụ; ẩn theo cờ/GUEST; nhóm ARCHIVED chỉ xem. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('../api/study.service', () => ({ studyService: { workspaceAccess: jest.fn() } }));

const mocked = jest.mocked(studyService);
const mockedFeature = jest.mocked(useFeature);

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeature.mockReturnValue(true);
  mocked.workspaceAccess.mockResolvedValue({
    id: 'ws-1',
    myRole: 'MEMBER',
    name: 'Nhóm Toán',
    status: 'ACTIVE',
  });
});

describe('StudyHubCard (hub nhóm)', () => {
  it('cờ study tắt ⇒ không hiện gì', async () => {
    mockedFeature.mockReturnValue(false);
    await renderWithProviders(<StudyHubCard wsId="ws-1" />);
    expect(screen.queryByText('Học')).toBeNull();
    expect(mocked.workspaceAccess).not.toHaveBeenCalled();
  });

  it('khách (GUEST) ⇒ ẩn hẳn (BE trả 404 mọi bộ học của nhóm cho khách)', async () => {
    mocked.workspaceAccess.mockResolvedValue({
      id: 'ws-1',
      myRole: 'GUEST',
      name: 'Nhóm',
      status: 'ACTIVE',
    });
    const guest = await renderWithProviders(<StudyHubCard wsId="ws-1" />);
    await waitFor(() => expect(mocked.workspaceAccess).toHaveBeenCalled());
    await waitFor(() => expect(guest.queryByText('Bộ học của nhóm')).toBeNull());
  });

  it('thành viên ⇒ MỘT hàng "Bộ học của nhóm" (mũi tên) dẫn tới danh sách của nhóm', async () => {
    await renderWithProviders(<StudyHubCard wsId="ws-1" />);

    await fireEvent.press(await screen.findByText('Bộ học của nhóm'));
    expect(router.push).toHaveBeenCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/study',
    });
  });

  it('thành viên nhóm ACTIVE ⇒ thêm MỘT hành động phụ "Tạo bộ học cho nhóm" mở form tạo có sẵn nhóm', async () => {
    await renderWithProviders(<StudyHubCard wsId="ws-1" />);

    await fireEvent.press(await screen.findByText('Tạo bộ học cho nhóm'));
    expect(router.push).toHaveBeenCalledWith({
      params: { workspaceId: 'ws-1' },
      pathname: '/study/new',
    });
  });

  it('nhóm đã lưu trữ (ARCHIVED) ⇒ chỉ có hàng xem, KHÔNG có hành động tạo', async () => {
    mocked.workspaceAccess.mockResolvedValue({
      id: 'ws-1',
      myRole: 'MEMBER',
      name: 'Nhóm',
      status: 'ARCHIVED',
    });
    await renderWithProviders(<StudyHubCard wsId="ws-1" />);

    expect(await screen.findByText('Bộ học của nhóm')).toBeOnTheScreen();
    expect(screen.queryByText('Tạo bộ học cho nhóm')).toBeNull();
  });
});
