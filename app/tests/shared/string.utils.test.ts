import {
  getInitials,
  includesSearch,
  matchesSearch,
  normalizeSearch,
} from '@/shared/utils/format/string.utils';

describe('normalizeSearch', () => {
  it('bỏ dấu thanh và dấu mũ', () => {
    expect(normalizeSearch('Mét khối')).toBe('met khoi');
    expect(normalizeSearch('Nguyễn Văn Ạ')).toBe('nguyen van a');
  });

  /**
   * `đ` là MỘT ký tự độc lập (U+0111), không phải `d` + dấu gạch, nên
   * `normalize('NFD')` không đụng tới nó. Đây là ca hay bị bỏ sót nhất, và nó
   * làm hỏng đúng hai từ hay tìm nhất: "đồng" và "Đà Nẵng".
   */
  it('xử lý đ/Đ — thứ mà normalize("NFD") KHÔNG bỏ được', () => {
    expect(normalizeSearch('Đồng')).toBe('dong');
    expect(normalizeSearch('Đà Nẵng')).toBe('da nang');
    expect(normalizeSearch('điện')).toBe('dien');
  });

  it('gom khoảng trắng thừa — bàn phím di động hay chèn khi sửa giữa câu', () => {
    expect(normalizeSearch('  bê   tông  ')).toBe('be tong');
  });
});

describe('includesSearch', () => {
  it('tìm được khi người dùng gõ KHÔNG dấu', () => {
    expect(includesSearch('Mét khối', 'met khoi')).toBe(true);
    expect(includesSearch('Bê tông cốt thép', 'be tong')).toBe(true);
  });

  it('vẫn tìm được khi gõ ĐỦ dấu', () => {
    expect(includesSearch('Mét khối', 'mét khối')).toBe(true);
  });

  it('từ khoá rỗng ⇒ không lọc gì', () => {
    expect(includesSearch('bất kỳ', '')).toBe(true);
    expect(includesSearch('bất kỳ', '   ')).toBe(true);
  });

  it('null/undefined không làm nổ', () => {
    expect(includesSearch(null, 'x')).toBe(false);
    expect(includesSearch(undefined, 'x')).toBe(false);
  });

  it('không khớp thì trả false', () => {
    expect(includesSearch('Mét khối', 'tấn')).toBe(false);
  });
});

describe('matchesSearch', () => {
  it('khớp trên bất kỳ trường nào', () => {
    expect(matchesSearch('ct2026', 'Cầu Nhật Tân', 'CT2026-001')).toBe(true);
    expect(matchesSearch('nhat tan', 'Cầu Nhật Tân', 'CT2026-001')).toBe(true);
    expect(matchesSearch('xyz', 'Cầu Nhật Tân', 'CT2026-001')).toBe(false);
  });

  it('bỏ qua trường rỗng', () => {
    expect(matchesSearch('tan', null, undefined, 'Nhật Tân')).toBe(true);
  });
});

describe('getInitials', () => {
  /**
   * Người Việt gọi nhau bằng TÊN (chữ cuối), nên "Nguyễn Văn An" phải ra "NA".
   * Lấy hai chữ đầu ("NV") là cách của tên phương Tây và đọc lên không nhận ra ai.
   */
  it('lấy chữ đầu của HỌ và của TÊN', () => {
    expect(getInitials('Nguyễn Văn An')).toBe('NA');
    expect(getInitials('Trần Thị Bình')).toBe('TB');
  });

  it('một từ thì lấy một chữ', () => {
    expect(getInitials('An')).toBe('A');
  });

  it('rỗng/null trả chuỗi rỗng', () => {
    expect(getInitials('')).toBe('');
    expect(getInitials(null)).toBe('');
    expect(getInitials('   ')).toBe('');
  });
});
