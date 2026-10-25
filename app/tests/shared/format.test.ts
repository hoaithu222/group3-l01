import {
  CURRENCY_UNIT,
  formatCurrency,
  formatNumber,
  THOUSANDS_SEPARATOR,
} from '@/shared/utils/format/currency.utils';
import {
  maskAccountNumber,
  maskCardNumber,
  maskName,
  maskPhone,
} from '@/shared/utils/format/mask.utils';

/**
 * ⚠️ Test THUẦN Node — ⛔ không render component ở đây. Hai file util này không
 * đụng tới React, và kéo `@testing-library/react-native` vào chỉ để chạy vài
 * phép nối chuỗi làm suite chậm hơn cả chục lần.
 */

describe('formatNumber', () => {
  it('chèn dấu phân cách mỗi 3 chữ số', () => {
    expect(formatNumber(89500000)).toBe('89.500.000');
    expect(formatNumber(1000)).toBe('1.000');
    expect(formatNumber(100)).toBe('100');
  });

  /**
   * Dấu phân cách phải đến từ ĐÚNG MỘT hằng số. Test này viết theo hằng số nên
   * nó vẫn xanh sau khi đổi — nó canh chỗ KHÁC: canh việc không ai rải dấu phẩy
   * viết cứng vào giữa hàm.
   */
  it('dấu phân cách lấy từ hằng số duy nhất', () => {
    expect(formatNumber(1000)).toBe(`1${THOUSANDS_SEPARATOR}000`);
  });

  it('số 0 ra "0", không phải chuỗi rỗng', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('số âm giữ dấu trừ ở TRƯỚC số', () => {
    expect(formatNumber(-89500000)).toBe('-89.500.000');
    expect(formatNumber(-999)).toBe('-999');
  });

  it('mặc định làm tròn về số nguyên', () => {
    expect(formatNumber(1234.4)).toBe('1.234');
    expect(formatNumber(1234.5)).toBe('1.235');
  });

  it('`decimals` giữ phần lẻ, dấu thập phân NGƯỢC với dấu hàng nghìn', () => {
    expect(formatNumber(1234.567, { decimals: 2 })).toBe('1.234,57');
    expect(formatNumber(0.5, { decimals: 1 })).toBe('0,5');
  });

  /**
   * ⛔ `(-0.4).toFixed(0)` cho `'-0'`. Lọt ra màn hình thì người dùng thấy
   * `-0 VND` và trình đọc màn hình nói "âm không đồng".
   */
  it('không bao giờ ra "-0"', () => {
    expect(formatNumber(-0.4)).toBe('0');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-0.004, { decimals: 2 })).toBe('0,00');
  });

  /**
   * ⛔ `toFixed` bỏ cuộc từ 1e21 và trả `'1e+21'`. Không xử thì chuỗi ký hiệu
   * khoa học hiện nguyên si lên màn hình mà kiểu trả về vẫn là `string` nên
   * không có lỗi nào báo.
   */
  it('số rất lớn không rơi về ký hiệu khoa học', () => {
    expect(formatNumber(9007199254740991)).toBe('9.007.199.254.740.991');
    expect(formatNumber(1e21)).toBe('1.000.000.000.000.000.000.000');
    expect(formatNumber(1.5e21)).toBe('1.500.000.000.000.000.000.000');
    expect(formatNumber(-1e21)).toBe('-1.000.000.000.000.000.000.000');
  });

  it('giá trị không dùng được ⇒ fallback, mặc định là chuỗi rỗng', () => {
    expect(formatNumber(undefined)).toBe('');
    expect(formatNumber(null)).toBe('');
    expect(formatNumber(Number.NaN)).toBe('');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatNumber(undefined, { fallback: '—' })).toBe('—');
  });

  it('`unit` thành hậu tố, cách số một dấu cách', () => {
    expect(formatNumber(5, { unit: 'chỉ' })).toBe('5 chỉ');
    expect(formatNumber(500000, { unit: 'B-Point' })).toBe('500.000 B-Point');
  });
});

describe('formatCurrency', () => {
  /**
   * ⚠️ Test này CỐ Ý viết cứng dấu chấm và chữ `VND`: nó là biên bản ghi lại
   * quyết định chọn **quy ước Việt Nam** (`89.500.000 VND`) thay vì dấu phẩy mà
   * bản vẽ Figma dùng (`89,500,000`). Lý do đầy đủ nằm ở `THOUSANDS_SEPARATOR`
   * trong `currency.utils.ts`.
   *
   * Đổi hằng số đó thì test này đỏ — đúng ý: đổi quy ước hiển thị tiền của cả
   * app phải là một hành động có chủ ý, không phải một dòng sửa nhân tiện.
   */
  it('quy ước VN: dấu CHẤM cho hàng nghìn và hậu tố `VND` viết hoa', () => {
    expect(formatCurrency(89500000)).toBe('89.500.000 VND');
    expect(formatCurrency(100000)).toBe('100.000 VND');
    expect(CURRENCY_UNIT).toBe('VND');
  });

  it('0 và số âm', () => {
    expect(formatCurrency(0)).toBe('0 VND');
    expect(formatCurrency(-1000)).toBe('-1.000 VND');
  });

  it('số lẻ bị làm tròn vì VND không có đơn vị lẻ', () => {
    expect(formatCurrency(1234.56)).toBe('1.235 VND');
    expect(formatCurrency(1234.56, { decimals: 2 })).toBe('1.234,56 VND');
  });

  it('số rất lớn vẫn ra chữ số, không ra "1e+21"', () => {
    expect(formatCurrency(1e21)).toBe('1.000.000.000.000.000.000.000 VND');
  });

  it('thiếu dữ liệu ⇒ KHÔNG bịa ra "0 VND"', () => {
    expect(formatCurrency(undefined)).toBe('');
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency(undefined, { fallback: '—' })).toBe('—');
  });

  it('`unit` đè được — kể cả bỏ hẳn đơn vị', () => {
    expect(formatCurrency(500000, { unit: 'B-Point' })).toBe('500.000 B-Point');
    expect(formatCurrency(89500000, { unit: '' })).toBe('89.500.000');
  });
});

describe('maskAccountNumber', () => {
  it('giữ 4 số cuối, luôn 4 chấm', () => {
    expect(maskAccountNumber('1234567890')).toBe('•••• 7890');
    expect(maskAccountNumber('12345678901234')).toBe('•••• 1234');
  });

  /** Số chấm KHÔNG theo độ dài thật — đếm chấm là đoán ra ngân hàng phát hành. */
  it('số chấm không đổi theo độ dài chuỗi', () => {
    expect(maskAccountNumber('123456789')).toBe('•••• 6789');
    expect(maskAccountNumber('123456789012345678')).toBe('•••• 5678');
  });

  it('dọn khoảng trắng và gạch nối có sẵn trước khi cắt', () => {
    expect(maskAccountNumber('1234 5678 90')).toBe('•••• 7890');
    expect(maskAccountNumber('1234-5678-90')).toBe('•••• 7890');
  });

  it('chuỗi ngắn hơn phần cần giữ ⇒ trả nguyên văn, không che', () => {
    expect(maskAccountNumber('123')).toBe('123');
    expect(maskAccountNumber('7890')).toBe('7890');
  });

  it('rỗng / undefined / null không làm nổ', () => {
    expect(maskAccountNumber('')).toBe('');
    expect(maskAccountNumber('   ')).toBe('');
    expect(maskAccountNumber(undefined)).toBe('');
    expect(maskAccountNumber(null)).toBe('');
  });

  it('`visible` đổi được số ký tự giữ lại', () => {
    expect(maskAccountNumber('1234567890', 2)).toBe('•••• 90');
  });

  /**
   * ⛔ Bẫy `slice(-0)`: `-0 === 0` nên `'123'.slice(-0)` trả về NGUYÊN chuỗi.
   * Viết theo lối quen tay thì `visible: 0` — nghĩa là "che hết" — lại in ra cả
   * số tài khoản sau bốn cái chấm. Không có lỗi nào báo; test này là thứ duy
   * nhất canh nó.
   */
  it('`visible: 0` che SẠCH, không lộ nguyên chuỗi', () => {
    expect(maskAccountNumber('1234567890', 0)).toBe('••••');
  });
});

describe('maskCardNumber', () => {
  it('khuôn 4-4-4-4 của thẻ ngân hàng', () => {
    expect(maskCardNumber('1234567812341234')).toBe('•••• •••• •••• 1234');
  });

  it('thẻ 15 số vẫn ra đúng khuôn ba nhóm — hàng thẻ không so le', () => {
    expect(maskCardNumber('123456789012345')).toBe('•••• •••• •••• 2345');
  });

  it('dọn dấu nhóm có sẵn', () => {
    expect(maskCardNumber('1234 5678 1234 1234')).toBe('•••• •••• •••• 1234');
  });

  it('ca biên', () => {
    expect(maskCardNumber('1234')).toBe('1234');
    expect(maskCardNumber('12')).toBe('12');
    expect(maskCardNumber('')).toBe('');
    expect(maskCardNumber(undefined)).toBe('');
  });
});

describe('maskPhone', () => {
  it('giữ đầu số và 3 số cuối, không chèn dấu cách', () => {
    expect(maskPhone('0912345678')).toBe('0912•••678');
    expect(maskPhone('0999999999')).toBe('0999•••999');
  });

  it('dọn dấu nhóm có sẵn', () => {
    expect(maskPhone('091 234 5678')).toBe('0912•••678');
  });

  it('ca biên', () => {
    expect(maskPhone('0912345')).toBe('0912345');
    expect(maskPhone('091')).toBe('091');
    expect(maskPhone('')).toBe('');
    expect(maskPhone(undefined)).toBe('');
  });
});

describe('maskName', () => {
  it('giữ chữ cái đầu mỗi từ', () => {
    expect(maskName('Nguyễn Văn An')).toBe('N••••• V•• A•');
    expect(maskName('An')).toBe('A•');
  });

  /**
   * ⛔ Chuỗi NFD (bàn phím iOS, vài backend) tách `ễ` thành `e` + hai dấu tổ
   * hợp ⇒ `'Nguyễn'.length` là 8 chứ không phải 6, và tên bị vẽ thừa hai chấm.
   */
  it('chuẩn hoá NFC trước khi đếm — không thừa chấm với chữ có dấu', () => {
    expect(maskName('Nguyễn'.normalize('NFD'))).toBe(maskName('Nguyễn'));
    expect(maskName('Nguyễn'.normalize('NFD'))).toBe('N•••••');
  });

  it('gom khoảng trắng thừa', () => {
    expect(maskName('  Trần   Thị  Bé ')).toBe('T••• T•• B•');
  });

  it('một ký tự thì không còn gì để che', () => {
    expect(maskName('A')).toBe('A');
  });

  it('rỗng / undefined / null không làm nổ', () => {
    expect(maskName('')).toBe('');
    expect(maskName('   ')).toBe('');
    expect(maskName(undefined)).toBe('');
    expect(maskName(null)).toBe('');
  });
});
