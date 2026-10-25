import { COVER_INK, COVER_SURFACE, coverToneFor } from '../components/visual/cover-tone';

/** Màu bìa suy TẤT ĐỊNH từ tiêu đề: cùng tiêu đề luôn cùng màu (danh sách, hộp chọn bộ, đầu trang tổng quan), và chỉ dùng năm tông "phân biệt". */
describe('coverToneFor', () => {
  it('tất định: cùng tiêu đề ⇒ cùng tông, bỏ qua khoảng trắng hai đầu', () => {
    expect(coverToneFor('Từ vựng IELTS')).toBe(coverToneFor('Từ vựng IELTS'));
    expect(coverToneFor('  Từ vựng IELTS  ')).toBe(coverToneFor('Từ vựng IELTS'));
  });

  it('chỉ trả năm tông phân biệt — KHÔNG `danger` (dành cho lỗi) và KHÔNG `neutral` (xám = không có bản sắc)', () => {
    const titles = Array.from(
      { length: 200 },
      (_, index) => `Bộ học số ${index} — Đà Nẵng ${index * 7}`,
    );
    const tones = new Set(titles.map(coverToneFor));

    expect([...tones].sort()).toEqual(['accent', 'brand', 'info', 'success', 'warning']);
  });

  it('rải đều: 200 tiêu đề khác nhau không dồn vào một tông (mỗi tông ≥ 10%)', () => {
    const counts = new Map<string, number>();
    for (let index = 0; index < 200; index += 1) {
      const tone = coverToneFor(`Bộ ${index} môn ${index % 13}`);
      counts.set(tone, (counts.get(tone) ?? 0) + 1);
    }

    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(20);
  });

  it('tiêu đề rỗng/ký tự hiếm (emoji, dấu tổ hợp) không ném lỗi và vẫn ra một tông hợp lệ', () => {
    for (const title of ['', '   ', '📚🔥', 'Ệ'.normalize('NFD')]) {
      expect(Object.keys(COVER_SURFACE)).toContain(coverToneFor(title));
    }
  });

  it('mỗi tông đều có nền `surface-*` và màu nét (không tông nào thiếu ở một trong hai bảng)', () => {
    expect(Object.keys(COVER_INK).sort()).toEqual(Object.keys(COVER_SURFACE).sort());
  });
});
