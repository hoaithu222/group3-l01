import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chatMentionsService } from '../api/chat-mentions.service';
import { ComposerBody } from '../components/composer/ComposerBody';
import { useSendMessage } from '../hooks/useSendMessage';

/**
 * Bảng emoji nối vào composer THẬT: nút emoji mở bảng → chạm emoji chèn tại con trỏ (không đóng bảng) → chạm lại ô nhập đóng bảng.
 * Chỉ mock hạ tầng (socket, upload, gửi) — `useComposerText`, `ComposerRow`, `EmojiPanel` chạy thật (cùng cách dựng `composer-role-mention.test.tsx`).
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
  jest.spyOn(chatMentionsService, 'list').mockResolvedValue({ canMentionAll: false, users: [] });
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

const PANEL = 'Bảng biểu tượng cảm xúc';

describe('ComposerBody — bảng emoji', () => {
  it('mặc định bảng đóng; nút emoji mở bảng, nút đổi thành "Bàn phím"', async () => {
    const screen = await renderBody();
    expect(screen.queryByLabelText(PANEL)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));

    expect(screen.getByLabelText(PANEL)).toBeOnTheScreen();
    expect(screen.getByLabelText('Bàn phím')).toBeOnTheScreen();
  });

  it('chạm emoji chèn TẠI CON TRỎ, bảng vẫn mở để chèn tiếp; có chữ ⇒ nút Gửi thay Mic', async () => {
    const screen = await renderBody();
    const input = screen.getByLabelText('Nội dung tin nhắn');
    await fireEvent.changeText(input, 'Chào bạn');
    await fireEvent(input, 'selectionChange', { nativeEvent: { selection: { end: 4, start: 4 } } });
    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));

    await fireEvent.press(screen.getByLabelText('Chèn 😀'));
    await fireEvent.press(screen.getByLabelText('Chèn 😃')); // FlatList chỉ dựng ~8 hàng đầu — chọn emoji ở nhóm đầu

    // con trỏ ở 4 (ngay sau "Chào"): hai emoji vào đúng chỗ đó, theo đúng thứ tự chạm, dấu cách cũ đẩy ra sau
    expect(screen.getByLabelText('Nội dung tin nhắn').props.value).toBe('Chào😀😃 bạn');
    expect(screen.getByLabelText(PANEL)).toBeOnTheScreen();
    expect(screen.getByLabelText('Gửi')).toBeEnabled();
  });

  it('chỉ có emoji cũng gửi được, và nội dung gửi đi đúng chuỗi emoji', async () => {
    const screen = await renderBody();
    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));
    await fireEvent.press(screen.getByLabelText('Chèn 🙂'));

    await fireEvent.press(screen.getByLabelText('Gửi'));

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ content: '🙂' }));
  });

  it('chạm lại ô nhập (focus) ĐÓNG bảng — bàn phím trở lại', async () => {
    const screen = await renderBody();
    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));
    expect(screen.getByLabelText(PANEL)).toBeOnTheScreen();

    await fireEvent(screen.getByLabelText('Nội dung tin nhắn'), 'focus');

    expect(screen.queryByLabelText(PANEL)).toBeNull();
    expect(screen.getByLabelText('Biểu tượng cảm xúc')).toBeOnTheScreen();
  });

  it('nút "Bàn phím" khi bảng đang mở đóng bảng', async () => {
    const screen = await renderBody();
    await fireEvent.press(screen.getByLabelText('Biểu tượng cảm xúc'));

    await fireEvent.press(screen.getByLabelText('Bàn phím'));

    expect(screen.queryByLabelText(PANEL)).toBeNull();
  });
});
