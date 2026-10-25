import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';

import type { MentionRange } from '../api/chat.types';
import { EmojiPanel } from '../components/composer/EmojiPanel';
import { chatMentionsService } from '../api/chat-mentions.service';
import { commonPrefixLength, replaceSelection } from '../mentions/mention-selection';
import { useComposerText } from '../mentions/useComposerText';

jest.mock('../api/chat-mentions.service', () => ({ chatMentionsService: { list: jest.fn() } }));

const MINH = '507f1f77bcf86cd799439011';
const SCOPE = { scopeType: 'CHANNEL' as const, scopeId: 'ch-1' };
const chip = (start: number, label = 'Minh'): MentionRange => ({
  start,
  end: start + label.length + 1,
  type: 'USER',
  userId: MINH,
  label,
});
const at = (position: number, end = position) =>
  ({ nativeEvent: { selection: { start: position, end } } }) as never;

describe('replaceSelection — chèn emoji giữ đúng range chip nhắc tên', () => {
  const text = 'Chào @Minh nhé'; // chip [5,10)

  it('chèn ở cuối chữ: chip không đổi, con trỏ ra sau đoạn chèn', () => {
    const out = replaceSelection(text, [chip(5)], { start: 14, end: 14 }, '😀');
    expect(out.text).toBe('Chào @Minh nhé😀');
    expect(out.ranges).toEqual([chip(5)]);
    expect(out.cursor).toBe(16); // emoji = 2 đơn vị UTF-16
  });

  it('chèn TRƯỚC chip: chip dịch sang phải đúng bằng độ dài đoạn chèn', () => {
    const out = replaceSelection(text, [chip(5)], { start: 0, end: 0 }, '❤️');
    expect(out.text).toBe('❤️Chào @Minh nhé');
    expect(out.ranges).toEqual([chip(7)]);
    expect(out.text.slice(out.ranges[0]!.start, out.ranges[0]!.end)).toBe('@Minh');
  });

  it('chèn ĐÚNG mép cuối chip: chip vẫn còn (chữ mới nằm ngoài @Tên)', () => {
    const out = replaceSelection(text, [chip(5)], { start: 10, end: 10 }, '😀');
    expect(out.text).toBe('Chào @Minh😀 nhé');
    expect(out.ranges).toEqual([chip(5)]);
  });

  it('chèn GIỮA chip: chip thành chữ thường (không để range lệch chữ)', () => {
    const out = replaceSelection(text, [chip(5)], { start: 8, end: 8 }, '😀');
    expect(out.text).toBe('Chào @Mi😀nh nhé');
    expect(out.ranges).toEqual([]);
  });

  it('đang bôi đen: thay cả vùng, chip đứng sau dịch theo độ chênh', () => {
    // bôi đen "Chào " (0–5) rồi chèn 😀 (2 đơn vị): chip [5,10) → [2,7)
    const out = replaceSelection(text, [chip(5)], { start: 0, end: 5 }, '😀');
    expect(out.text).toBe('😀@Minh nhé');
    expect(out.ranges).toEqual([chip(2)]);
    expect(out.cursor).toBe(2);
  });

  it('vị trí ngoài biên / đảo đầu-cuối được kẹp lại, không ném lỗi', () => {
    expect(replaceSelection('ab', [], { start: 50, end: 50 }, '😀').text).toBe('ab😀');
    expect(replaceSelection('ab', [], { start: 2, end: 0 }, 'x').text).toBe('x');
  });
});

describe('commonPrefixLength', () => {
  it('đếm phần đầu chung', () => {
    expect(commonPrefixLength('Chào @Minh', 'Chào ')).toBe(5);
    expect(commonPrefixLength('abc', 'abc')).toBe(3);
    expect(commonPrefixLength('', 'abc')).toBe(0);
  });
});

async function setup(initialText: string, initialRanges: MentionRange[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => useComposerText({ scope: SCOPE, initialText, initialRanges, onChange: jest.fn() }),
    { wrapper },
  );
}

describe('useComposerText.insertText — chạm emoji khi ô đã mất focus', () => {
  beforeEach(() => {
    jest.mocked(chatMentionsService.list).mockResolvedValue({ users: [], canMentionAll: false });
  });

  it('chèn tại con trỏ cuối cùng native báo và ÉP con trỏ ra sau emoji', async () => {
    const { result } = await setup('Xin chào');
    await act(async () => result.current.changeSelection(at(4)));

    await act(async () => result.current.insertText('😀'));

    expect(result.current.text).toBe('Xin 😀chào');
    expect(result.current.forcedSelection).toEqual({ start: 6, end: 6 });
  });

  it('chạm liền hai emoji ra ĐÚNG thứ tự (con trỏ phải tự tiến, không đứng trước emoji đầu)', async () => {
    const { result } = await setup('');
    await act(async () => result.current.insertText('A'));
    await act(async () => result.current.insertText('😀'));
    await act(async () => result.current.insertText('B'));

    expect(result.current.text).toBe('A😀B');
  });

  it('giữ chip nhắc tên: chèn sau chip không làm chip lệch, chèn trước thì dịch đúng', async () => {
    const { result } = await setup('Chào @Minh', [chip(5)]);

    await act(async () => result.current.insertText('😀')); // con trỏ khởi tạo = cuối chữ
    expect(result.current.text).toBe('Chào @Minh😀');
    expect(result.current.ranges).toEqual([chip(5)]);

    await act(async () => result.current.changeSelection(at(0)));
    await act(async () => result.current.insertText('❤️'));
    expect(result.current.ranges).toEqual([chip(7)]);
    expect(result.current.serialized.content).toBe(`❤️Chào @{u:${MINH}}😀`);
  });

  it('sau khi gửi (reset) chèn emoji vào ô rỗng ở vị trí 0, không dựa vào con trỏ cũ', async () => {
    const { result } = await setup('một câu khá dài');
    await act(async () => result.current.changeSelection(at(10)));
    await act(async () => result.current.reset());

    await act(async () => result.current.insertText('😀'));

    expect(result.current.text).toBe('😀');
  });
});

describe('useComposerText.changeText — Backspace xoá nguyên chip', () => {
  beforeEach(() => {
    jest.mocked(chatMentionsService.list).mockResolvedValue({ users: [], canMentionAll: false });
  });

  it('ÉP con trỏ về chỗ chip vừa đứng (value bị ghi đè khác chữ native ⇒ Android đẩy con trỏ về cuối)', async () => {
    const { result } = await setup('Chào @Minh và bạn', [chip(5)]);

    // Backspace ngay sau chip: native báo 'Chào @Min và bạn'
    await act(async () => result.current.changeText('Chào @Min và bạn'));

    expect(result.current.text).toBe('Chào  và bạn');
    expect(result.current.ranges).toEqual([]);
    expect(result.current.forcedSelection).toEqual({ start: 5, end: 5 });
  });

  it('gõ thường (text = chữ native báo) KHÔNG ép con trỏ — không giành quyền với bộ gõ Telex', async () => {
    const { result } = await setup('Chao');

    await act(async () => result.current.changeText('Chào'));

    expect(result.current.text).toBe('Chào');
    expect(result.current.forcedSelection).toBeUndefined();
  });
});

describe('EmojiPanel', () => {
  it('hiện lưới emoji; chạm một ô gọi onSelect đúng ký tự (bảng không tự đóng)', async () => {
    const onSelect = jest.fn();
    const screen = await render(<EmojiPanel onSelect={onSelect} />);

    await fireEvent.press(screen.getByLabelText('Chèn 😀'));
    await fireEvent.press(screen.getByLabelText('Chèn 😃'));

    expect(onSelect).toHaveBeenNthCalledWith(1, '😀');
    expect(onSelect).toHaveBeenNthCalledWith(2, '😃');
    expect(screen.getByText('Mặt cười & cảm xúc')).toBeOnTheScreen();
  });
});
