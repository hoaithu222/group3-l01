import { recapHeadingIcon } from '../utils/recap-heading-icon';
import { tokenizeRecapInline } from '../utils/recap-markdown';

/** Icon mốc cho tiêu đề nhỏ của biên bản — TRANG TRÍ, nên chỉ cần: đúng ba khối của mẫu, gõ không dấu vẫn khớp, lạ thì rơi về icon chung. */
const iconOf = (heading: string) => recapHeadingIcon(tokenizeRecapInline(heading));

describe('recapHeadingIcon', () => {
  it('ba khối của mẫu biên bản (Mục tiêu · Quyết định · Việc cần làm) có icon riêng', () => {
    expect(iconOf('Mục tiêu')).toBe('star');
    expect(iconOf('Quyết định')).toBe('checkmark-circle');
    expect(iconOf('Việc cần làm')).toBe('checkmark-square');
  });

  it('bỏ dấu + không phân biệt hoa/thường, kể cả khi tiêu đề có chữ đậm', () => {
    expect(iconOf('VIEC CAN LAM tuần này')).toBe('checkmark-square');
    expect(iconOf('**Kết luận** chung')).toBe('checkmark-circle');
  });

  it('tiêu đề không khớp từ khoá nào ⇒ icon tài liệu chung (không bao giờ trống)', () => {
    expect(iconOf('Phụ lục')).toBe('document');
    expect(iconOf('')).toBe('document');
  });
});
