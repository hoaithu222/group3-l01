import type { ConversationListItemLastMessage } from '../api/conversations.types';
import { lastMessagePreview } from './last-message-preview';

function makeMessage(overrides: Partial<ConversationListItemLastMessage> = {}): ConversationListItemLastMessage {
  return {
    id: 'm-1',
    seq: 1,
    authorId: 'u-2',
    authorName: 'An',
    kind: 'USER',
    systemType: null,
    preview: 'Chào bạn',
    attachmentKind: null,
    deleted: false,
    createdAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('lastMessagePreview', () => {
  it('rỗng khi chưa có tin nào', () => {
    expect(lastMessagePreview(null, 'me')).toBe('');
  });

  it('thêm tiền tố "Bạn:" khi tin cuối là của chính mình', () => {
    expect(lastMessagePreview(makeMessage({ authorId: 'me', preview: 'Ok nhé' }), 'me')).toBe('Bạn: Ok nhé');
  });

  it('không thêm tiền tố khi tin của người khác', () => {
    expect(lastMessagePreview(makeMessage({ authorId: 'u-2', preview: 'Chào bạn' }), 'me')).toBe('Chào bạn');
  });

  it('câu trung tính khi tin đã thu hồi', () => {
    expect(lastMessagePreview(makeMessage({ deleted: true }), 'me')).toBe('Tin nhắn đã được thu hồi');
  });

  it('nguyên văn preview cho tin hệ thống, không thêm "Bạn:"', () => {
    expect(
      lastMessagePreview(makeMessage({ authorId: 'me', kind: 'SYSTEM', preview: 'An đã tạo nhóm' }), 'me'),
    ).toBe('An đã tạo nhóm');
  });

  it('nhãn ngoặc vuông cho đính kèm ảnh, giữ tiền tố "Bạn:"', () => {
    expect(lastMessagePreview(makeMessage({ authorId: 'me', attachmentKind: 'IMAGE' }), 'me')).toBe('Bạn: [Ảnh]');
  });

  it('nhãn ngoặc vuông cho tin nhắn thoại', () => {
    expect(lastMessagePreview(makeMessage({ authorId: 'u-2', attachmentKind: 'VOICE' }), 'me')).toBe('[Tin nhắn thoại]');
  });

  it('nhãn ngoặc vuông cho tệp đính kèm', () => {
    expect(lastMessagePreview(makeMessage({ authorId: 'u-2', attachmentKind: 'FILE' }), 'me')).toBe('[Tệp đính kèm]');
  });
});
