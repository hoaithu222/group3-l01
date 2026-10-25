import { applyRecapFormat } from '../utils/markdown-insert.utils';
import { tokenizeRecap, tokenizeRecapInline } from '../utils/recap-markdown';
import { retentionNote, spokenDuration } from '../utils/recording-format.utils';

describe('recap-markdown — hiển thị markdown-lite AN TOÀN', () => {
  it('tiêu đề nhỏ, danh sách, số thứ tự, việc cần làm (xong/chưa) và đoạn văn gộp dòng liền nhau', () => {
    const blocks = tokenizeRecap('### Mục tiêu\nDòng một\ndòng hai\n\n- ý A\n2. ý B\n- [ ] việc chưa xong\n- [x] việc đã xong');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'item', 'item', 'todo', 'todo']);
    expect(blocks[3]).toMatchObject({ marker: '2.' });
    expect(blocks[4]).toMatchObject({ done: false });
    expect(blocks[5]).toMatchObject({ done: true });
    expect(blocks[1]).toMatchObject({ children: [{ text: 'Dòng một\ndòng hai', type: 'text' }] });
  });

  it('chỉ nhận liên kết https:// — http, javascript:, data: và HTML ra dưới dạng CHỮ THƯỜNG', () => {
    const nodes = tokenizeRecapInline('xem https://docs.vn/a và http://lừa.vn javascript:alert(1) <script>x</script>');
    expect(nodes.filter((n) => n.type === 'link')).toEqual([{ text: 'https://docs.vn/a', type: 'link', url: 'https://docs.vn/a' }]);
    expect(nodes.map((n) => n.text).join('')).toContain('<script>x</script>');
  });

  it('đậm/nghiêng bằng ** và _ (hoặc *)', () => {
    expect(tokenizeRecapInline('**đậm** _nghiêng_ *nghiêng2*')).toEqual([
      { text: 'đậm', type: 'bold' },
      { text: ' ', type: 'text' },
      { text: 'nghiêng', type: 'italic' },
      { text: ' ', type: 'text' },
      { text: 'nghiêng2', type: 'italic' },
    ]);
  });
});

describe('markdown-insert — thanh chèn nhanh', () => {
  it('Đậm bọc `**…**` quanh VÙNG CHỌN và giữ chọn phần chữ bên trong', () => {
    expect(applyRecapFormat('chốt ngân sách', { end: 14, start: 5 }, 'bold')).toEqual({
      selection: { end: 16, start: 7 },
      text: 'chốt **ngân sách**',
    });
  });

  it('vùng chọn rỗng: con trỏ đứng GIỮA cặp dấu để gõ tiếp; vùng chọn vượt độ dài chữ (bộ gõ báo cũ) bị kẹp', () => {
    expect(applyRecapFormat('ab', { end: 2, start: 2 }, 'italic')).toEqual({ selection: { end: 3, start: 3 }, text: 'ab__' });
    expect(applyRecapFormat('ab', { end: 9, start: 7 }, 'bold').text).toBe('ab****');
  });

  it('Việc cần làm/Danh sách/Tiêu đề thêm tiền tố cho MỌI dòng trong vùng chọn; bấm lần hai gỡ; đổi kiểu thì THAY tiền tố cũ', () => {
    const todo = applyRecapFormat('a\nb', { end: 3, start: 0 }, 'todo');
    expect(todo.text).toBe('- [ ] a\n- [ ] b');
    expect(applyRecapFormat(todo.text, { end: todo.text.length, start: 0 }, 'todo').text).toBe('a\nb');
    expect(applyRecapFormat('- ý', { end: 3, start: 3 }, 'todo').text).toBe('- [ ] ý');
    expect(applyRecapFormat('Mục tiêu', { end: 0, start: 0 }, 'heading').text).toBe('### Mục tiêu');
  });
});

describe('recording-format', () => {
  it('thời lượng nói bằng chữ; "Tự xoá sau N ngày" theo giờ server', () => {
    expect(spokenDuration(30)).toBe('dưới 1 phút');
    expect(spokenDuration(2700)).toBe('45 phút');
    expect(spokenDuration(3900)).toBe('1 giờ 05 phút');
    const now = Date.parse('2026-09-25T00:00:00.000Z');
    expect(retentionNote('2026-10-18T00:00:00.000Z', now)).toBe('Tự xoá sau 23 ngày');
    expect(retentionNote('2026-09-25T10:00:00.000Z', now)).toBe('Tự xoá trong hôm nay');
    expect(retentionNote(undefined, now)).toBeNull();
  });
});
