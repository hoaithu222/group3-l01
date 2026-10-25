import type { MentionRange } from '../api/chat.types';
import { findMentionTrigger } from './mention-trigger';

describe('findMentionTrigger', () => {
  it('@ ở đầu chuỗi hoặc sau khoảng trắng mở picker, query là chữ sau @', () => {
    expect(findMentionTrigger('@mi', 3, [])).toEqual({ start: 0, query: 'mi' });
    expect(findMentionTrigger('Chào @mi', 8, [])).toEqual({ start: 5, query: 'mi' });
    expect(findMentionTrigger('Chào @', 6, [])).toEqual({ start: 5, query: '' });
  });

  it('sau xuống dòng cũng mở', () => {
    expect(findMentionTrigger('dòng 1\n@an', 10, [])).toEqual({ start: 7, query: 'an' });
  });

  it('e-mail (@ dính sau chữ) KHÔNG mở picker', () => {
    expect(findMentionTrigger('gửi a@b.com', 11, [])).toBeNull();
  });

  it('tên có MỘT dấu cách vẫn mở; hai dấu cách liền nhau thì đóng', () => {
    expect(findMentionTrigger('@Nguyễn Văn', 11, [])?.query).toBe('Nguyễn Văn');
    expect(findMentionTrigger('@Nguyễn  Văn', 12, [])).toBeNull();
  });

  it('"@ " (dấu cách ngay sau @) và xoá mất @ đều đóng', () => {
    expect(findMentionTrigger('email @ nhà', 11, [])).toBeNull();
    expect(findMentionTrigger('mi', 2, [])).toBeNull();
  });

  it('con trỏ vừa dừng ở cuối một chip đã có KHÔNG mở lại picker', () => {
    const chip: MentionRange = { start: 0, end: 5, type: 'USER', userId: 'u1', label: 'Minh' };
    expect(findMentionTrigger('@Minh', 5, [chip])).toBeNull();
  });

  it('chữ sau @ quá dài (câu, không phải từ khoá) thì không mở', () => {
    expect(findMentionTrigger(`@${'a'.repeat(40)}`, 41, [])).toBeNull();
  });

  it('dấu ngắt dòng giữa @ và con trỏ đóng picker', () => {
    expect(findMentionTrigger('@an\nxin', 7, [])).toBeNull();
  });
});
