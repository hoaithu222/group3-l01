import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import { getSystemMessageRenderer } from '@/features/chat/components/system/system-renderer.registry';
import type { MessageView } from '@/features/chat/api/chat.types';

import '@/shell/chat/register-meeting-cards';

/**
 * p2-06 — NƠI LẮP RÁP thẻ chat biên bản/bản ghi họp. Lỗi ở đây "im lặng" (tsc/eslint xanh, thẻ chỉ hiện "Nội dung chưa hỗ trợ"): `chat` và
 * `meeting-recap` không import nhau, chỉ nơi lắp ráp đăng ký renderer vào registry của chat — quên một dòng, hoặc quên import module đăng ký
 * ở `(app)/_layout.tsx`, là thẻ rơi về `UnsupportedSystem`. Hai tầng khoá: (1) layout THẬT sự import module đăng ký (đọc file — không dựng
 * cả cây route trong Jest); (2) sau khi module đó chạy, registry trả đúng renderer và renderer vẽ đúng thẻ.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('expo-video', () => ({
  useVideoPlayer: () => ({ addListener: () => ({ remove: jest.fn() }) }),
  VideoView: () => null,
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => false),
  shareAsync: jest.fn(),
}));

const ROOT = path.join(__dirname, '..', '..');
const layout = fs
  .readFileSync(path.join(ROOT, 'app', '(app)', '_layout.tsx'), 'utf8')
  // Bỏ chú thích để đường dẫn nhắc TRONG chú thích không bị tính là import thật.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function systemMessage(systemType: string, systemPayload: Record<string, unknown>): MessageView {
  return { kind: 'SYSTEM', systemPayload, systemType } as unknown as MessageView;
}

describe('p2-06 — thẻ tin hệ thống của biên bản/bản ghi họp', () => {
  it('(app)/_layout.tsx import module đăng ký ở module scope (side-effect, ngoài mọi hàm)', () => {
    expect(layout).toMatch(/^import '@\/shell\/chat\/register-meeting-cards';$/m);
  });

  it('MEETING_RECAP có renderer: vẽ thẻ biên bản (không rơi về "Nội dung chưa hỗ trợ")', async () => {
    const renderer = getSystemMessageRenderer('MEETING_RECAP');
    expect(renderer).toBeDefined();

    await render(
      <>
        {renderer?.(
          systemMessage('MEETING_RECAP', { meetingId: 'meet-1', title: 'Giao ban tuần' }),
        )}
      </>,
    );

    expect(screen.getByText('Biên bản: Giao ban tuần')).toBeOnTheScreen();
    expect(screen.getByText('Xem biên bản')).toBeOnTheScreen();
    expect(screen.queryByText(/chưa hỗ trợ/)).toBeNull();
  });

  it('MEETING_RECORDING_READY có renderer: vẽ thẻ "Bản ghi cuộc họp đã sẵn sàng"', async () => {
    const renderer = getSystemMessageRenderer('MEETING_RECORDING_READY');
    expect(renderer).toBeDefined();

    await render(
      <>
        {renderer?.(
          systemMessage('MEETING_RECORDING_READY', {
            durationSec: 2700,
            meetingId: 'meet-1',
            recordingId: 'rec-1',
          }),
        )}
      </>,
    );

    expect(screen.getByText('Bản ghi cuộc họp đã sẵn sàng · 45 phút')).toBeOnTheScreen();
    expect(screen.getByText('Xem')).toBeOnTheScreen();
  });
});
