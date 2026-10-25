import { applyFormat } from '../utils/markdown-edit';
import { isLongText, tokenizeInline, tokenizeMarkdown } from '../utils/markdown';

describe('tokenizeMarkdown', () => {
  it('nhận tiêu đề, danh sách, trích dẫn, khối code và đoạn văn theo thứ tự', () => {
    const blocks = tokenizeMarkdown('# Mục tiêu\nMô tả **đậm**\n\n- một\n- hai\n\n> ghi chú\n\n```js\nconst a = **x**;\n```');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list', 'quote', 'code']);
    expect(blocks[0]).toMatchObject({ level: 1, type: 'heading' });
    expect(blocks[2]).toMatchObject({ ordered: false, type: 'list' });
    // Khối code KHÔNG phân tích bên trong: `**x**` vẫn là chữ thô.
    expect(blocks[4]).toEqual({ text: 'const a = **x**;', type: 'code' });
  });

  it('danh sách đánh số nhận diện ordered', () => {
    const [list] = tokenizeMarkdown('1. a\n2. b');
    expect(list).toMatchObject({ ordered: true, type: 'list' });
  });

  it('HTML KHÔNG được diễn giải: <script> và javascript: ra chữ thường, không thành link', () => {
    const [paragraph] = tokenizeMarkdown('<script>alert(1)</script> [bấm](javascript:alert(1)) data:text/html,x');
    expect(paragraph?.type).toBe('paragraph');
    const nodes = paragraph && 'children' in paragraph ? paragraph.children : [];
    expect(nodes.every((node) => node.type === 'text')).toBe(true);
    expect(nodes.map((node) => node.text).join('')).toContain('<script>');
  });
});

describe('tokenizeInline', () => {
  it('đậm · nghiêng · gạch · code · liên kết có chữ · URL trần', () => {
    const nodes = tokenizeInline('a **b** _c_ ~~d~~ `e` [tài liệu](https://x.vn/a) https://y.vn/b');
    expect(nodes.filter((node) => node.type !== 'text').map((node) => node.type)).toEqual([
      'bold',
      'italic',
      'strike',
      'code',
      'link',
      'link',
    ]);
    expect(nodes.find((node) => node.type === 'link')).toEqual({
      text: 'tài liệu',
      type: 'link',
      url: 'https://x.vn/a',
    });
  });

  it('gạch dưới trong từ (snake_case) không thành chữ nghiêng', () => {
    expect(tokenizeInline('biến_số_lớn').every((node) => node.type === 'text')).toBe(true);
  });
});

describe('isLongText', () => {
  it('dài theo số dòng hoặc số ký tự', () => {
    expect(isLongText('a\n'.repeat(13), 12)).toBe(true);
    expect(isLongText('x'.repeat(800), 12)).toBe(true);
    expect(isLongText('ngắn', 12)).toBe(false);
  });
});

describe('applyFormat (thanh chèn nhanh)', () => {
  it('bọc vùng chọn bằng ** và giữ chọn phần chữ bên trong', () => {
    const result = applyFormat('làm ngay', { end: 8, start: 4 }, 'bold');
    expect(result.text).toBe('làm **ngay**');
    expect(result.selection).toEqual({ end: 10, start: 6 });
  });

  it('vùng chọn rỗng: chèn cặp dấu và đặt con trỏ GIỮA', () => {
    const result = applyFormat('a', { end: 1, start: 1 }, 'italic');
    expect(result.text).toBe('a__');
    expect(result.selection).toEqual({ end: 2, start: 2 });
  });

  it('danh sách: thêm "- " mọi dòng đang chọn, bấm lần hai thì gỡ', () => {
    const once = applyFormat('một\nhai', { end: 7, start: 0 }, 'list');
    expect(once.text).toBe('- một\n- hai');
    expect(applyFormat(once.text, { end: once.text.length, start: 0 }, 'list').text).toBe('một\nhai');
  });

  it('code nhiều dòng thành khối ```, một dòng thành `code`', () => {
    expect(applyFormat('a\nb', { end: 3, start: 0 }, 'code').text).toBe('```\na\nb\n```');
    expect(applyFormat('x', { end: 1, start: 0 }, 'code').text).toBe('`x`');
  });
});
