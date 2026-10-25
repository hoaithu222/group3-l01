import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import type { MessageView } from '@/features/chat/api/chat.types';
import { SystemLine } from '@/features/chat/components/system/SystemLine';
import { getSystemMessageRenderer } from '@/features/chat/components/system/system-renderer.registry';

import '@/shell/chat/register-mentor-cards';

/**
 * p6-03 — NƠI LẮP RÁP thẻ chat `MENTOR_JOINED`/`MENTOR_LEFT`. Lỗi ở đây "im lặng" (tsc/eslint xanh, thẻ chỉ hiện "Nội dung chưa hỗ trợ"):
 * `chat` và `mentor` không import nhau, chỉ nơi lắp ráp đăng ký renderer vào registry của chat — quên một dòng, hoặc quên import module
 * đăng ký ở `(app)/_layout.tsx`, là thẻ rơi về `UnsupportedSystem`. Hai tầng khoá: (1) layout THẬT sự import module đăng ký (đọc file);
 * (2) sau khi module đó chạy, đi qua `SystemLine` THẬT thì thẻ vẽ đúng, có tên tra từ `resolveAuthor`.
 */
const ROOT = path.join(__dirname, '..', '..');
const layout = fs
  .readFileSync(path.join(ROOT, 'app', '(app)', '_layout.tsx'), 'utf8')
  // Bỏ chú thích để đường dẫn nhắc TRONG chú thích không bị tính là import thật.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function systemMessage(systemType: string, systemPayload: Record<string, unknown>): MessageView {
  return { kind: 'SYSTEM', systemPayload, systemType } as unknown as MessageView;
}

const resolveAuthor = (userId: string) => (userId === 'm1' ? { name: 'Trần Lan' } : undefined);

describe('p6-03 — thẻ tin hệ thống của cố vấn', () => {
  it('(app)/_layout.tsx import module đăng ký ở module scope (side-effect, ngoài mọi hàm)', () => {
    expect(layout).toMatch(/^import '@\/shell\/chat\/register-mentor-cards';$/m);
  });

  it('registry có renderer cho cả MENTOR_JOINED lẫn MENTOR_LEFT', () => {
    expect(getSystemMessageRenderer('MENTOR_JOINED')).toBeDefined();
    expect(getSystemMessageRenderer('MENTOR_LEFT')).toBeDefined();
  });

  it('MENTOR_JOINED qua SystemLine: vẽ thẻ có tên cố vấn + hạn, KHÔNG rơi về "chưa hỗ trợ"', async () => {
    await render(
      <SystemLine
        message={systemMessage('MENTOR_JOINED', {
          endsAt: '2026-10-30T10:00:00.000Z',
          mentorId: 'm1',
        })}
        resolveAuthor={resolveAuthor}
      />,
    );

    expect(screen.getByText('Cố vấn Trần Lan tham gia đến 30/10/2026')).toBeOnTheScreen();
    expect(screen.queryByText(/chưa hỗ trợ/)).toBeNull();
  });

  it('MENTOR_LEFT qua SystemLine: vẽ "Đợt cố vấn của … đã hết hạn"', async () => {
    await render(
      <SystemLine
        message={systemMessage('MENTOR_LEFT', { mentorId: 'm1', reason: 'EXPIRED' })}
        resolveAuthor={resolveAuthor}
      />,
    );

    expect(screen.getByText('Đợt cố vấn của Trần Lan đã hết hạn')).toBeOnTheScreen();
    expect(screen.queryByText(/chưa hỗ trợ/)).toBeNull();
  });

  it('không có resolveAuthor (màn cha không cấp) ⇒ vẫn vẽ, câu không tên', async () => {
    await render(
      <SystemLine message={systemMessage('MENTOR_LEFT', { mentorId: 'm1', reason: 'LEFT' })} />,
    );

    expect(screen.getByText('Cố vấn đã rời nhóm')).toBeOnTheScreen();
  });
});
