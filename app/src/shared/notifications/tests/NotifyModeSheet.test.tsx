import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  accountModeFromChoice,
  channelModeFromChoice,
  choiceFromAccountMode,
  choiceFromChannelMode,
  inheritLabel,
  mutedUntilFromHours,
} from '../notify-mode';
import { NotifyModeSheet, type NotifyModeSheetProps } from '../NotifyModeSheet';

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

describe('notify-mode — đổi qua lại enum BE', () => {
  it('tài khoản/nhóm: MENTIONS_AND_THREADS ↔ MENTIONS; ALL/MUTED/INHERIT giữ nguyên', () => {
    expect(choiceFromAccountMode('MENTIONS_AND_THREADS')).toBe('MENTIONS');
    expect(choiceFromAccountMode('INHERIT')).toBe('INHERIT');
    expect(accountModeFromChoice('MENTIONS')).toBe('MENTIONS_AND_THREADS');
    expect(accountModeFromChoice('MUTED')).toBe('MUTED');
  });

  it('kênh: ALL_MESSAGES ↔ ALL, MENTIONS_AND_THREADS ↔ MENTIONS', () => {
    expect(choiceFromChannelMode('ALL_MESSAGES')).toBe('ALL');
    expect(choiceFromChannelMode('MENTIONS_AND_THREADS')).toBe('MENTIONS');
    expect(channelModeFromChoice('ALL')).toBe('ALL_MESSAGES');
    expect(channelModeFromChoice('MENTIONS')).toBe('MENTIONS_AND_THREADS');
    expect(channelModeFromChoice('INHERIT')).toBe('INHERIT');
  });

  it('inheritLabel hiện giá trị kế thừa THỰC TẾ; chưa biết thì chỉ "Theo mặc định"', () => {
    expect(inheritLabel('ALL')).toBe('Theo mặc định (Mọi tin)');
    expect(inheritLabel('MENTIONS')).toBe('Theo mặc định (Chỉ nhắc tên & luồng)');
    expect(inheritLabel(undefined)).toBe('Theo mặc định');
  });

  it('mutedUntilFromHours: null = tới khi bật lại; còn lại cộng đúng số giờ', () => {
    const now = new Date('2026-09-21T10:00:00.000Z');
    expect(mutedUntilFromHours(null, now)).toBeNull();
    expect(mutedUntilFromHours(8, now)).toBe('2026-09-21T18:00:00.000Z');
  });
});

async function renderSheet(props: Partial<NotifyModeSheetProps> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NotifyModeSheet
        current="INHERIT"
        title="Thông báo"
        visible
        onClose={onClose}
        onSelect={onSelect}
        {...props}
      />
    </SafeAreaProvider>,
  );
  return { onClose, onSelect };
}

describe('NotifyModeSheet', () => {
  it('nhóm chat: 4 lựa chọn, "Theo mặc định" hiện giá trị kế thừa thực tế', async () => {
    await renderSheet({ inherited: 'ALL' });
    expect(screen.getByText('Mọi tin')).toBeOnTheScreen();
    expect(screen.getByText('Chỉ nhắc tên & luồng')).toBeOnTheScreen();
    expect(screen.getByText('Tắt tiếng')).toBeOnTheScreen();
    expect(screen.getByText('Theo mặc định (Mọi tin)')).toBeOnTheScreen();
  });

  it('tin 1-1 (showMentions=false) KHÔNG có "Chỉ nhắc tên"', async () => {
    await renderSheet({ showMentions: false });
    expect(screen.queryByText('Chỉ nhắc tên & luồng')).toBeNull();
  });

  it('chọn một chế độ → onSelect(choice, null) và đóng — xoá hạn tắt tiếng cũ', async () => {
    const { onClose, onSelect } = await renderSheet({ current: 'MUTED' });
    await userEvent.press(screen.getByText('Chỉ nhắc tên & luồng'));
    expect(onSelect).toHaveBeenCalledWith('MENTIONS', null);
    expect(onClose).toHaveBeenCalled();
  });

  it('Tắt tiếng KHÔNG có thời lượng (kênh/nhóm làm việc) → MUTED ngay, không hỏi bao lâu', async () => {
    const { onSelect } = await renderSheet();
    await userEvent.press(screen.getByText('Tắt tiếng'));
    expect(onSelect).toHaveBeenCalledWith('MUTED', null);
  });

  it('Tắt tiếng CÓ thời lượng (hội thoại) → hỏi bao lâu; "Cho tới khi bật lại" là MUTED + null, KHÔNG phải INHERIT', async () => {
    const { onSelect } = await renderSheet({ supportsDuration: true });
    await userEvent.press(screen.getByText('Tắt tiếng'));
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('Cho tới khi bật lại'));
    expect(onSelect).toHaveBeenCalledWith('MUTED', null);
  });

  it('tắt tiếng 1 giờ → mutedUntil là ISO ở tương lai', async () => {
    const { onSelect } = await renderSheet({ supportsDuration: true });
    await userEvent.press(screen.getByText('Tắt tiếng'));
    await userEvent.press(screen.getByText('1 giờ'));

    const [choice, mutedUntil] = onSelect.mock.calls[0] as [string, string];
    expect(choice).toBe('MUTED');
    expect(new Date(mutedUntil).getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
  });
});
