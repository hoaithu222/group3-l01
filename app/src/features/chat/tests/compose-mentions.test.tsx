import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { chatMentionsService } from '../api/chat-mentions.service';
import { useComposerText } from '../mentions/useComposerText';

jest.mock('../api/chat-mentions.service', () => ({ chatMentionsService: { list: jest.fn() } }));

const MINH = '507f1f77bcf86cd799439011';
const SCOPE = { scopeType: 'CHANNEL' as const, scopeId: 'ch-1' };
const selection = (at: number) => ({ nativeEvent: { selection: { start: at, end: at } } }) as never;

async function setup(initialText = '') {
  const onChange = jest.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(
    () => useComposerText({ scope: SCOPE, initialText, initialRanges: [], onChange }),
    { wrapper },
  );
  return { ...hook, onChange };
}

/** Gõ một đoạn chữ vào ô: `onChangeText` rồi con trỏ ra cuối, đúng thứ tự RN báo. */
async function type(result: Awaited<ReturnType<typeof setup>>['result'], text: string) {
  await act(async () => {
    result.current.changeText(text);
    result.current.changeSelection(selection(text.length));
  });
}

describe('useComposerText — gõ @, chọn gợi ý, gửi marker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(chatMentionsService.list).mockResolvedValue({
      users: [{ userId: MINH, name: 'Minh', avatarUrl: null }],
      canMentionAll: false,
    });
  });

  it('gõ "@mi" mở picker; chọn người → chèn chip, con trỏ ra sau, content chứa marker đúng parser BE', async () => {
    const { result, onChange } = await setup();
    await type(result, 'Chào @mi');

    await waitFor(() => expect(result.current.picker.open).toBe(true));
    await waitFor(() => expect(result.current.picker.result?.users).toHaveLength(1));
    expect(chatMentionsService.list).toHaveBeenCalledWith(SCOPE, 'mi');

    await act(async () =>
      result.current.picker.pick({ type: 'USER', userId: MINH, label: 'Minh' }),
    );

    expect(result.current.text).toBe('Chào @Minh ');
    expect(result.current.ranges).toEqual([
      { start: 5, end: 10, type: 'USER', userId: MINH, label: 'Minh' },
    ]);
    expect(result.current.forcedSelection).toEqual({ start: 11, end: 11 });
    expect(result.current.serialized.content).toBe(`Chào @{u:${MINH}} `);
    expect(result.current.serialized.mentions).toEqual([
      { type: 'USER', targetId: MINH, label: 'Minh' },
    ]);
    expect(onChange).toHaveBeenLastCalledWith('Chào @Minh ', result.current.ranges);
    // con trỏ đã ra ngoài chip → picker tự đóng, không mở lại
    expect(result.current.picker.open).toBe(false);
  });

  it('native báo đã đặt xong con trỏ ép → thả `selection` (không giành quyền với bộ gõ)', async () => {
    const { result } = await setup();
    await type(result, '@mi');
    await waitFor(() => expect(result.current.picker.open).toBe(true));
    await act(async () =>
      result.current.picker.pick({ type: 'USER', userId: MINH, label: 'Minh' }),
    );
    expect(result.current.forcedSelection).toBeDefined();

    await act(async () => result.current.changeSelection(selection(6)));
    expect(result.current.forcedSelection).toBeUndefined();
  });

  it('Backspace ngay sau chip xoá NGUYÊN chip (MSG-37) — không để lại marker hỏng', async () => {
    const { result } = await setup();
    await type(result, '@mi');
    await waitFor(() => expect(result.current.picker.open).toBe(true));
    await act(async () =>
      result.current.picker.pick({ type: 'USER', userId: MINH, label: 'Minh' }),
    );

    // con trỏ ở giữa dấu cách và chip: xoá dấu cách, rồi Backspace vào cuối chip
    await type(result, '@Minh');
    await type(result, '@Min');

    expect(result.current.text).toBe('');
    expect(result.current.ranges).toEqual([]);
    expect(result.current.serialized.content).toBe('');
  });

  it('gõ chữ thường không gọi mentionables; đóng khi xoá @', async () => {
    const { result } = await setup();
    await type(result, 'xin chào');
    expect(result.current.picker.open).toBe(false);
    expect(chatMentionsService.list).not.toHaveBeenCalled();
  });

  it('lỗi mạng → picker ẨN, vẫn gõ thường được', async () => {
    jest.mocked(chatMentionsService.list).mockRejectedValue(new Error('offline'));
    const { result } = await setup();
    await type(result, '@mi');
    await waitFor(() => expect(chatMentionsService.list).toHaveBeenCalled());
    await waitFor(() => expect(result.current.picker.open).toBe(false));
    await type(result, '@mih');
    expect(result.current.text).toBe('@mih');
  });

  it('serialize dùng cho đếm độ dài: marker dài hơn chữ hiển thị', async () => {
    const { result } = await setup();
    await type(result, '@mi');
    await waitFor(() => expect(result.current.picker.open).toBe(true));
    await act(async () =>
      result.current.picker.pick({ type: 'USER', userId: MINH, label: 'Minh' }),
    );
    expect(result.current.serialized.content.length).toBeGreaterThan(result.current.text.length);
  });
});
