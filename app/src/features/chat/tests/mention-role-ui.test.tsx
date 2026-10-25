import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, userEvent, waitFor } from '@testing-library/react-native';

import { apiClient } from '@/core/api/client';

import { chatMentionsService } from '../api/chat-mentions.service';
import type { MentionablesResult } from '../api/chat.types';
import { ComposerNotices } from '../components/composer/ComposerNotices';
import { MentionChipText } from '../mentions/MentionChipText';
import { MentionPickerSheet } from '../mentions/MentionPickerSheet';
import { useComposerText } from '../mentions/useComposerText';

/**
 * `@role` (p3-04 app.md §3): nhóm "Vai trò" ở ĐẦU picker khi BE báo `canMentionRole`, chọn → chip + marker `@{r:…}`, composer nhắc "khoảng N người".
 * Service chỉ xin `includeRoles` ở KÊNH.
 */
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn() } }));

const ROLES: MentionablesResult = {
  canMentionAll: false,
  canMentionRole: true,
  roles: [
    { label: 'Quản trị viên', recipientCount: 3, roleRef: 'ADMIN' },
    { label: 'Thành viên', recipientCount: 40, roleRef: 'MEMBER' },
  ],
  users: [{ avatarUrl: null, name: 'Minh Tú', userId: 'u1' }],
};

describe('chatMentionsService.list — includeRoles', () => {
  beforeEach(() => jest.clearAllMocks());
  const ok = () =>
    jest
      .mocked(apiClient.get)
      .mockResolvedValue({ data: { data: { canMentionAll: false, users: [] }, success: true } });

  it('KÊNH: xin `includeRoles: true` để biết có được @role và số người nhận', async () => {
    ok();
    await chatMentionsService.list({ scopeId: 'ch-1', scopeType: 'CHANNEL' }, 'qu');

    expect(apiClient.get).toHaveBeenCalledWith('/scopes/CHANNEL/ch-1/mentionables', {
      params: { includeRoles: true, limit: 20, q: 'qu' },
      skipErrorToast: true,
    });
  });

  it('HỘI THOẠI: KHÔNG gửi includeRoles (không có @role ở đó)', async () => {
    ok();
    await chatMentionsService.list({ scopeId: 'c-1', scopeType: 'CONVERSATION' }, '');

    expect(apiClient.get).toHaveBeenCalledWith('/scopes/CONVERSATION/c-1/mentionables', {
      params: { limit: 20, q: '' },
      skipErrorToast: true,
    });
  });
});

describe('MentionPickerSheet — nhóm "Vai trò"', () => {
  const props = { loading: false, onPickAll: jest.fn(), onPickUser: jest.fn() };

  it('canMentionRole → nhóm "Vai trò" đứng TRƯỚC danh sách người, mỗi dòng nói "khoảng N người"; chạm trả đúng vai trò', async () => {
    const onPickRole = jest.fn();
    const screen = await render(
      <MentionPickerSheet {...props} result={ROLES} onPickRole={onPickRole} />,
    );

    expect(screen.getByText('Vai trò')).toBeOnTheScreen();
    expect(screen.getByText('Sẽ thông báo cho khoảng 3 người')).toBeOnTheScreen();
    expect(screen.getByText('@Thành viên')).toBeOnTheScreen();
    const labels = screen
      .getAllByText(/^(@Quản trị viên|@Thành viên|Minh Tú)$/)
      .map((node) => node.props.children);
    expect(labels).toEqual(['@Quản trị viên', '@Thành viên', 'Minh Tú']);

    await userEvent.press(screen.getByText('@Quản trị viên'));
    expect(onPickRole).toHaveBeenCalledWith(ROLES.roles?.[0]);
  });

  it('⛔ không có quyền (canMentionRole false / vắng) hoặc không truyền onPickRole → KHÔNG có nhóm "Vai trò"', async () => {
    const denied = await render(
      <MentionPickerSheet
        {...props}
        result={{ ...ROLES, canMentionRole: false }}
        onPickRole={jest.fn()}
      />,
    );
    expect(denied.queryByText('Vai trò')).toBeNull();
    await denied.unmount();

    const noHandler = await render(<MentionPickerSheet {...props} result={ROLES} />);
    expect(noHandler.queryByText('Vai trò')).toBeNull();
    expect(noHandler.getByText('Minh Tú')).toBeOnTheScreen();
  });

  it('gõ "@qu" lọc nhóm vai trò theo chữ (bỏ dấu, hoa/thường): còn "Quản trị viên", mất "Thành viên"', async () => {
    const screen = await render(
      <MentionPickerSheet {...props} query="QUAN" result={ROLES} onPickRole={jest.fn()} />,
    );

    expect(screen.getByText('@Quản trị viên')).toBeOnTheScreen();
    expect(screen.queryByText('@Thành viên')).toBeNull();
  });

  it('không có ai để báo (recipientCount 0) → nói rõ thay vì "khoảng 0 người"', async () => {
    const screen = await render(
      <MentionPickerSheet
        {...props}
        result={{
          ...ROLES,
          roles: [{ label: 'Quản trị viên', recipientCount: 0, roleRef: 'ADMIN' }],
        }}
        onPickRole={jest.fn()}
      />,
    );

    expect(screen.getByText('Chưa có ai khác để thông báo')).toBeOnTheScreen();
  });
});

describe('MentionChipText / ComposerNotices — @role', () => {
  it('bong bóng: @{r:ADMIN} hiện "@Quản trị viên" (nhãn ảnh chụp thắng), không lộ marker hay "ADMIN"', async () => {
    const screen = await render(
      <Text>
        <MentionChipText
          mentions={[{ label: 'Ban điều hành', targetId: 'ADMIN', type: 'ROLE' }]}
          text="Cc @{r:ADMIN} nhé"
          tone="default"
        />
      </Text>,
    );

    expect(screen.getByText('@Ban điều hành')).toBeOnTheScreen();
    expect(screen.queryByText(/ADMIN|@\{/)).toBeNull();
  });

  it('dòng nhắc "Sẽ thông báo cho khoảng N người" chỉ hiện khi có chuỗi (không chặn gửi)', async () => {
    const base = {
      invalidMentionLabel: undefined,
      onRateLimitExpire: jest.fn(),
      overLimitLength: undefined,
      retryAfterAt: undefined,
      scopeType: 'CHANNEL' as const,
    };
    const withNotice = await render(
      <ComposerNotices {...base} roleAudienceNotice="Sẽ thông báo cho khoảng 40 người" />,
    );
    expect(withNotice.getByText('Sẽ thông báo cho khoảng 40 người')).toBeOnTheScreen();
    await withNotice.unmount();

    const without = await render(<ComposerNotices {...base} />);
    expect(without.queryByText(/Sẽ thông báo/)).toBeNull();
  });
});

describe('useComposerText — chọn @role', () => {
  const SCOPE = { scopeId: 'ch-1', scopeType: 'CHANNEL' as const };
  const selection = (at: number) =>
    ({ nativeEvent: { selection: { start: at, end: at } } }) as never;

  it('gõ "@qu" → picker có roles + query; chọn vai trò → chip @Quản trị viên, content @{r:ADMIN}, mentions ROLE', async () => {
    jest.spyOn(chatMentionsService, 'list').mockResolvedValue(ROLES);
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = await renderHook(
      () =>
        useComposerText({ initialRanges: [], initialText: '', onChange: jest.fn(), scope: SCOPE }),
      { wrapper },
    );

    await act(async () => {
      result.current.changeText('Cc @qu');
      result.current.changeSelection(selection(6));
    });
    await waitFor(() => expect(result.current.picker.result?.roles).toHaveLength(2));
    expect(result.current.picker.query).toBe('qu');

    await act(async () =>
      result.current.picker.pick({
        label: 'Quản trị viên',
        recipientCount: 3,
        roleRef: 'ADMIN',
        type: 'ROLE',
      }),
    );

    expect(result.current.text).toBe('Cc @Quản trị viên ');
    expect(result.current.serialized.content).toBe('Cc @{r:ADMIN} ');
    expect(result.current.serialized.mentions).toEqual([
      { label: 'Quản trị viên', targetId: 'ADMIN', type: 'ROLE' },
    ]);
    expect(result.current.ranges[0]).toMatchObject({
      recipientCount: 3,
      roleRef: 'ADMIN',
      type: 'ROLE',
    });
  });
});
