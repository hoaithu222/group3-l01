import fs from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetProfileRows, ProfileRowsSlot } from '@/shared/profile';
import {
  ComposerAttachRowsSlot,
  MessageActionRowsSlot,
  renderMessageBody,
  type MessageExtensionScope,
} from '@/shared/message-extensions';

import '@/shell/chat/register-chat-extensions';

/**
 * p7-04 — NƠI LẮP RÁP khảo sát/hẹn giờ/nhắc lại/tạo task. Lỗi ở đây "im lặng" (tsc/eslint xanh, tin khảo sát chỉ hiện câu hỏi như chữ thường, menu "+" không có "Khảo sát"):
 * `chat` và `chat-extensions` không import nhau, chỉ nơi lắp ráp đăng ký vào khe — quên import module đăng ký ở layout gốc là mất cả tính năng. Hai tầng khoá: (1) `app/_layout.tsx` THẬT sự
 * import module đăng ký (đọc file — không dựng cả cây route trong Jest); (2) sau khi module đó chạy, các khe của `chat` có renderer.
 */
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }), useFeature: () => true }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: () => 'connected' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const ROOT = path.join(__dirname, '..', '..');
const rootLayout = fs
  .readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8')
  // Bỏ chú thích để đường dẫn nhắc TRONG chú thích không bị tính là import thật.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const SCOPE: MessageExtensionScope = { scopeId: 'ch-1', scopeType: 'CHANNEL' };
const withProviders = (node: React.ReactNode) => <SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>;

describe('p7-04 — lắp ráp chat-extensions vào chat', () => {
  it('app/_layout.tsx import module đăng ký ở module scope (side-effect, ngoài mọi hàm)', () => {
    expect(rootLayout).toMatch(/^import '@\/shell\/chat\/register-chat-extensions';$/m);
  });

  it('khe thân bong bóng nhận tin khảo sát (POLL có poll); tin thường thì không', () => {
    const poll = { authorId: 'u', deleted: false, id: 'm', kind: 'POLL' as const, poll: {} as never, threadId: null };
    expect(renderMessageBody({ isOwn: false, message: poll, scope: SCOPE })).not.toBeNull();
    expect(renderMessageBody({ isOwn: false, message: { ...poll, kind: 'USER', poll: undefined }, scope: SCOPE })).toBeNull();
  });

  it('khe menu tin có "Nhắc lại"/"Tạo task"; khe menu "+" có "Khảo sát"/"Hẹn giờ gửi"', async () => {
    const message = { authorId: 'u', deleted: false, id: 'm', kind: 'USER' as const, threadId: null };
    const draft = { attachmentAssetIds: [], canSubmit: true, consume: jest.fn(), content: 'a', mentions: [] };
    await render(
      withProviders(
        <>
          <MessageActionRowsSlot message={message} scope={SCOPE} onDone={jest.fn()} />
          <ComposerAttachRowsSlot draft={draft} scope={SCOPE} onDone={jest.fn()} />
        </>,
      ),
    );

    for (const label of ['Nhắc lại', 'Tạo task', 'Khảo sát', 'Hẹn giờ gửi']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  it('màn Tôi có hai hàng lối vào "Tin đã hẹn" và "Nhắc lại của tôi"', async () => {
    await render(withProviders(<ProfileRowsSlot />));

    expect(screen.getByText('Tin đã hẹn')).toBeOnTheScreen();
    expect(screen.getByText('Nhắc lại của tôi')).toBeOnTheScreen();
    resetProfileRows();
  });
});
