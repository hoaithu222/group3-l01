import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chatMentionsService } from '../api/chat-mentions.service';
import { ComposerBody } from '../components/composer/ComposerBody';
import { useSendMessage } from '../hooks/useSendMessage';

/**
 * `@role` đi hết đường ở composer THẬT (p3-04 app.md §3): gõ "@" → picker có nhóm "Vai trò" → chọn → chip + dòng nhắc "khoảng N người" → Gửi
 * đưa marker `@{r:ADMIN}` và `mentions[]` ROLE cho `useSendMessage`. Chỉ mock hạ tầng (socket, upload, gửi) — `useComposerText`, picker,
 * `ComposerNotices` chạy thật.
 */
jest.mock('@/core/socket', () => ({
  scopeKeyOf: (type: string, id: string) => `${type}:${id}`,
  useTypingEmitter: () => ({ onChangeText: jest.fn(), stop: jest.fn() }),
}));
jest.mock('@/core/uploads/use-upload', () => ({
  useUpload: () => ({ cancel: jest.fn(), enqueue: jest.fn(), items: [], retry: jest.fn() }),
}));
jest.mock('@/core/media/pick-media', () => ({
  pickDocuments: jest.fn(),
  pickImages: jest.fn(),
  takePhoto: jest.fn(),
}));
jest.mock('../hooks/useSendMessage', () => ({ useSendMessage: jest.fn() }));
jest.mock('../hooks/useMessageActions', () => ({
  useMessageActions: () => ({ editMessage: jest.fn() }),
}));

const SCOPE = { scopeId: 'ch-1', scopeType: 'CHANNEL' } as const;
const send = jest.fn();

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useSendMessage).mockReturnValue({ send } as never);
});

async function renderBody() {
  return render(
    <ComposerBody
      findMessage={() => undefined}
      initialRanges={[]}
      initialText=""
      scope={SCOPE}
      target={undefined}
      onChangeTarget={jest.fn()}
    />,
    { wrapper: wrapper() },
  );
}

describe('ComposerBody — @role', () => {
  it('OWNER/ADMIN: chọn "@Quản trị viên" → dòng nhắc + gửi marker @{r:ADMIN} và mentions ROLE', async () => {
    jest.spyOn(chatMentionsService, 'list').mockResolvedValue({
      canMentionAll: false,
      canMentionRole: true,
      roles: [{ label: 'Quản trị viên', recipientCount: 5, roleRef: 'ADMIN' }],
      users: [],
    });
    const screen = await renderBody();
    const input = screen.getByLabelText('Nội dung tin nhắn');

    await fireEvent.changeText(input, 'Cc @qu');
    await fireEvent(input, 'selectionChange', {
      nativeEvent: { selection: { end: 6, start: 6 } },
    });
    await fireEvent.press(await screen.findByText('@Quản trị viên'));

    expect(await screen.findByText('Sẽ thông báo cho khoảng 5 người')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Gửi'));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Cc @{r:ADMIN}',
        mentions: [{ label: 'Quản trị viên', targetId: 'ADMIN', type: 'ROLE' }],
      }),
    );
  });

  it('⛔ người không có quyền (canMentionRole false): picker KHÔNG có nhóm "Vai trò"', async () => {
    jest.spyOn(chatMentionsService, 'list').mockResolvedValue({
      canMentionAll: false,
      canMentionRole: false,
      users: [{ avatarUrl: null, name: 'Minh Tú', userId: 'u1' }],
    });
    const screen = await renderBody();
    const input = screen.getByLabelText('Nội dung tin nhắn');

    await fireEvent.changeText(input, '@mi');
    await fireEvent(input, 'selectionChange', {
      nativeEvent: { selection: { end: 3, start: 3 } },
    });

    expect(await screen.findByText('Minh Tú')).toBeOnTheScreen();
    expect(screen.queryByText('Vai trò')).toBeNull();
  });
});
