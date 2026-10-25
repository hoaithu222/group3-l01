import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { MessageView } from '../api/chat.types';
import { SystemLine } from '../components/system/SystemLine';
import { registerSystemMessageRenderer } from '../components/system/system-renderer.registry';

/** Chỉ điền phần `SystemLine` đọc; còn lại không liên quan tới điểm mở rộng. */
function systemMessage(
  systemType: MessageView['systemType'],
  systemPayload: MessageView['systemPayload'],
): MessageView {
  return { kind: 'SYSTEM', systemPayload, systemType } as MessageView;
}

/**
 * Điểm mở rộng tin hệ thống (p6-04): module NGOÀI đăng ký thẻ riêng cho một `systemType` mà `chat` không
 * biết — chat KHÔNG import module đó. Registry là state cấp module nên các ca dưới chạy THEO THỨ TỰ:
 * ca "chưa đăng ký" phải đứng trước ca đăng ký.
 */
describe('registerSystemMessageRenderer', () => {
  it('chưa đăng ký ⇒ rơi về "Nội dung chưa hỗ trợ" như cũ (không crash)', async () => {
    await render(
      <SystemLine
        message={systemMessage('WALLET_REMINDER', { debtorsCount: 2, workspaceId: 'w1' })}
      />,
    );
    expect(screen.getByText('Nội dung chưa hỗ trợ trên phiên bản này')).toBeOnTheScreen();
  });

  it('đăng ký rồi ⇒ vẽ bằng renderer của module ngoài, nhận đúng message', async () => {
    registerSystemMessageRenderer('WALLET_REMINDER', (message) => (
      <Text>Ví: {String(message.systemPayload?.debtorsCount)} người</Text>
    ));

    await render(
      <SystemLine
        message={systemMessage('WALLET_REMINDER', { debtorsCount: 2, workspaceId: 'w1' })}
      />,
    );

    expect(screen.getByText('Ví: 2 người')).toBeOnTheScreen();
    expect(screen.queryByText('Nội dung chưa hỗ trợ trên phiên bản này')).toBeNull();
  });

  it('không đụng tới các loại tin hệ thống có sẵn', async () => {
    await render(<SystemLine message={systemMessage('MEMBER_JOINED', { userId: 'u1' })} />);
    expect(screen.getByText('Thành viên đã tham gia')).toBeOnTheScreen();
  });

  it('renderer nhận `resolveAuthor` của SystemLine qua tham số thứ hai (thẻ nói về một NGƯỜI hiện được tên)', async () => {
    registerSystemMessageRenderer('MENTOR_JOINED', (message, context) => (
      <Text>Tên: {context?.resolveAuthor?.(String(message.systemPayload?.mentorId))?.name ?? 'không rõ'}</Text>
    ));
    const resolveAuthor = (userId: string) => (userId === 'm1' ? { name: 'Trần Lan' } : undefined);

    await render(
      <SystemLine
        message={systemMessage('MENTOR_JOINED', { mentorId: 'm1' })}
        resolveAuthor={resolveAuthor}
      />,
    );
    expect(screen.getByText('Tên: Trần Lan')).toBeOnTheScreen();
  });

  it('SystemLine không có `resolveAuthor` ⇒ context vẫn có mặt nhưng bộ tra vắng (renderer phải chịu được)', async () => {
    registerSystemMessageRenderer('MENTOR_LEFT', (_message, context) => (
      <Text>{context?.resolveAuthor ? 'có bộ tra' : 'không có bộ tra'}</Text>
    ));

    await render(<SystemLine message={systemMessage('MENTOR_LEFT', { mentorId: 'm1', reason: 'LEFT' })} />);
    expect(screen.getByText('không có bộ tra')).toBeOnTheScreen();
  });

  it('đăng ký lặp cùng loại là GHI ĐÈ (an toàn với Fast Refresh)', async () => {
    registerSystemMessageRenderer('WALLET_REMINDER', () => <Text>bản mới</Text>);

    await render(<SystemLine message={systemMessage('WALLET_REMINDER', null)} />);

    expect(screen.getByText('bản mới')).toBeOnTheScreen();
  });
});
