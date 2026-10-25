import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { ConversationDetail } from '../api/conversations.types';
import { GroupInfo } from '../components/InfoSections/GroupInfo';

/**
 * Trợ năng của phần "Thông tin nhóm":
 *  · hai công tắc "Cài đặt nhóm" phải có TÊN (`Toggle label`) — trước đây nhãn là một `<Text>` đứng cạnh, còn công tắc
 *    thì không tên: trình đọc màn hình chỉ xướng "công tắc, bật";
 *  · tên nhóm chỉ là NÚT khi người xem có quyền đổi tên (không thì xướng "nút" mà chạm vào chẳng có gì).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const mockPatchMutate = jest.fn();
jest.mock('../hooks/usePatchConversation', () => ({
  usePatchConversation: () => ({ mutate: mockPatchMutate }),
}));
jest.mock('../hooks/useGroupMembers', () => ({ useGroupMembers: () => ({ data: undefined }) }));
jest.mock('../hooks/useMemberActions', () => ({
  useMemberActions: () => ({
    dissolve: { isPending: false, mutate: jest.fn() },
    leave: { isPending: false, mutate: jest.fn() },
    transferOwner: { isPending: false, mutate: jest.fn() },
  }),
}));
jest.mock('../components/ConversationAvatar', () => ({ ConversationAvatar: () => null }));
jest.mock('../components/GroupSafetyRows', () => ({ GroupSafetyRows: () => null }));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

function group(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'c-1',
    isMeetingGroup: false,
    kind: 'GROUP',
    memberCount: 3,
    muted: false,
    myPermissions: {
      canAddMembers: true,
      canDissolve: false,
      canLeave: true,
      canRename: true,
    },
    myRole: 'OWNER',
    notifyMode: 'ALL',
    settings: { memberCanPin: false, membersCanAdd: true },
    title: 'Đồ án tốt nghiệp',
    version: 7,
    ...overrides,
  } as unknown as ConversationDetail;
}

beforeEach(() => jest.clearAllMocks());

describe('GroupInfo — công tắc "Cài đặt nhóm" có tên', () => {
  it('mỗi công tắc xướng đúng nhãn và trạng thái bật/tắt hiện tại', async () => {
    await render(<GroupInfo conversation={group()} />, { wrapper: Wrapper });

    const canAdd = screen.getByRole('switch', { name: 'Thành viên được thêm người khác' });
    const canPin = screen.getByRole('switch', { name: 'Thành viên được ghim tin' });

    expect(canAdd).toBeChecked();
    expect(canPin).not.toBeChecked();
  });

  it('bật công tắc gọi PATCH đúng khoá cài đặt, kèm `expectedVersion` (khoá lạc quan)', async () => {
    await render(<GroupInfo conversation={group()} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('switch', { name: 'Thành viên được ghim tin' }));

    expect(mockPatchMutate).toHaveBeenCalledWith({
      expectedVersion: 7,
      settings: { memberCanPin: true },
    });
  });

  it('thành viên thường (không phải OWNER/ADMIN) không thấy khối cài đặt', async () => {
    await render(<GroupInfo conversation={group({ myRole: 'MEMBER' })} />, { wrapper: Wrapper });

    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('GroupInfo — tên nhóm', () => {
  it('có quyền đổi tên ⇒ là NÚT, có gợi ý; chạm mở tờ "Đổi tên nhóm"', async () => {
    await render(<GroupInfo conversation={group()} />, { wrapper: Wrapper });

    const rename = screen.getByRole('button', { name: /Đồ án tốt nghiệp/ });
    expect(rename.props.accessibilityHint).toBe('Chạm để đổi tên nhóm');

    await fireEvent.press(rename);

    expect(await screen.findByText('Đổi tên nhóm')).toBeOnTheScreen();
  });

  it('KHÔNG có quyền đổi tên ⇒ không phải nút, không có gợi ý (chỉ là chữ)', async () => {
    await render(
      <GroupInfo
        conversation={group({
          myPermissions: {
            canAddMembers: false,
            canDissolve: false,
            canLeave: true,
            canRename: false,
          } as ConversationDetail['myPermissions'],
        })}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByRole('button', { name: /Đồ án tốt nghiệp/ })).toBeNull();
    expect(screen.getByText('Đồ án tốt nghiệp')).toBeOnTheScreen();
  });
});
