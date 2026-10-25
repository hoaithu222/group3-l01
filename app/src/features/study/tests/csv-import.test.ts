import { parseFlashcardText } from '../utils/csv-import';

/**
 * Nhập thẻ ghi nhớ từ văn bản dán (p4-01 P1): TSV từ bảng tính, CSV có ngoặc kép, CSV chấm phẩy của Excel bản Việt, dòng tiêu đề,
 * dòng lỗi kèm số dòng, và trần sức chứa của bộ.
 */
const OPTIONS = { capacity: 500, maxLength: 2000 };
const parse = (text: string, options = OPTIONS) => parseFlashcardText(text, options);

describe('parseFlashcardText — tách dòng/ô', () => {
  it('TSV (dán từ Excel/Sheets/Quizlet): mỗi dòng một thẻ, giữ nguyên dấu tiếng Việt', () => {
    const result = parse('apple\tquả táo\nbook\tquyển sách\n');
    expect(result.delimiter).toBe('\t');
    expect(result.cards).toEqual([
      { definition: 'quả táo', line: 1, term: 'apple' },
      { definition: 'quyển sách', line: 2, term: 'book' },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('CSV dấu phẩy; CRLF và BOM đầu tệp không lọt vào dữ liệu', () => {
    const bom = String.fromCharCode(0xfeff);
    const result = parse(`${bom}cat,con mèo\r\ndog,con chó\r\n`);
    expect(result.delimiter).toBe(',');
    expect(result.cards.map((c) => c.term)).toEqual(['cat', 'dog']);
  });

  it('CSV chấm phẩy (Excel bản Việt): định nghĩa chứa dấu phẩy không bị cắt', () => {
    const result = parse('chợ;nơi mua bán, trao đổi\nnhà;nơi ở');
    expect(result.delimiter).toBe(';');
    expect(result.cards[0]).toMatchObject({ definition: 'nơi mua bán, trao đổi', term: 'chợ' });
  });

  it('ô bọc ngoặc kép: chứa dấu phân cách, xuống dòng và "" (một dấu ngoặc kép)', () => {
    const text = '"a, b","dòng 1\ndòng 2"\n"nói ""xin chào""",hello';
    const result = parse(text);
    expect(result.cards).toEqual([
      { definition: 'dòng 1\ndòng 2', line: 1, term: 'a, b' },
      // Ô đa dòng ở dòng 1 chiếm hai dòng nguồn ⇒ thẻ kế tiếp bắt đầu ở dòng 3.
      { definition: 'hello', line: 3, term: 'nói "xin chào"' },
    ]);
  });

  it('cột thừa được NỐI vào định nghĩa (không bỏ mất chữ)', () => {
    const csv = parse('run,chạy,di chuyển nhanh');
    expect(csv.cards[0]?.definition).toBe('chạy, di chuyển nhanh');
    const tsv = parse('run\tchạy\tdi chuyển nhanh');
    expect(tsv.cards[0]?.definition).toBe('chạy di chuyển nhanh');
  });

  it('bỏ dòng trống; cắt khoảng trắng hai đầu mỗi ô', () => {
    const result = parse('\n  x  \t  y  \n\n   \t  \nz\tw');
    expect(result.cards).toEqual([
      { definition: 'y', line: 2, term: 'x' },
      { definition: 'w', line: 5, term: 'z' },
    ]);
  });
});

describe('parseFlashcardText — dòng tiêu đề', () => {
  it.each([
    'Term,Definition',
    'Thuật ngữ\tĐịnh nghĩa',
    'mat truoc;mat sau',
    'Question,Answer',
  ])('nhận ra "%s" là dòng tiêu đề và bỏ đi', (header) => {
    const sep = header.includes('\t') ? '\t' : header.includes(';') ? ';' : ',';
    const result = parse(`${header}\nhello${sep}xin chào`);
    expect(result.hasHeader).toBe(true);
    expect(result.cards).toEqual([{ definition: 'xin chào', line: 2, term: 'hello' }]);
  });

  it('dữ liệu thật tình cờ giống tiêu đề ở CỘT MỘT thôi thì KHÔNG bị bỏ', () => {
    const result = parse('term,là gì\nhello,xin chào');
    expect(result.hasHeader).toBe(false);
    expect(result.cards).toHaveLength(2);
  });
});

describe('parseFlashcardText — lỗi và trần', () => {
  it('dòng thiếu định nghĩa/thuật ngữ/quá dài bị loại, báo ĐÚNG số dòng', () => {
    const long = 'x'.repeat(11);
    const result = parse(`ok\tđược\nchỉ-một-cột\n\tthiếu-thuật-ngữ\n${long}\tdài`, {
      capacity: 500,
      maxLength: 10,
    });
    expect(result.cards.map((c) => c.term)).toEqual(['ok']);
    expect(result.errors).toEqual([
      { line: 2, message: '"chỉ-một-cột" chưa có định nghĩa.' },
      { line: 3, message: 'Thiếu thuật ngữ.' },
      { line: 4, message: 'Quá dài (mỗi mặt tối đa 10 ký tự).' },
    ]);
  });

  it('vượt sức chứa của bộ: giữ những thẻ đầu, báo số thẻ bị bỏ', () => {
    const rows = Array.from({ length: 7 }, (_, i) => `t${i}\td${i}`).join('\n');
    const result = parse(rows, { capacity: 5, maxLength: 2000 });
    expect(result.cards.map((c) => c.term)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(result.overflow).toBe(2);
  });

  it('bộ đã đầy (capacity 0) ⇒ không thẻ nào, mọi thẻ hợp lệ là overflow', () => {
    const result = parse('a\tb\nc\td', { capacity: 0, maxLength: 2000 });
    expect(result.cards).toEqual([]);
    expect(result.overflow).toBe(2);
  });

  it('ngoặc kép mở mà không đóng ⇒ báo dòng mở, không làm mất cả văn bản một cách im lặng', () => {
    const result = parse('a\tb\n"c\td\ne\tf');
    expect(result.errors.some((e) => e.line === 2 && /chưa được đóng/.test(e.message))).toBe(true);
    expect(result.cards[0]).toMatchObject({ term: 'a' });
  });

  it('văn bản rỗng/toàn khoảng trắng ⇒ không thẻ, không lỗi', () => {
    expect(parse('   \n\n')).toMatchObject({ cards: [], errors: [], overflow: 0 });
  });
});
