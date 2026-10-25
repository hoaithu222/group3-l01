import {
  buildVietQrPayload,
  crc16CcittFalse,
  hasValidCrc,
  transferNote,
  VietQrError,
} from '../domain/vietqr';

/** CRC-16/CCITT-FALSE cài đặt THEO BẢNG tra — cách tính độc lập với bản cộng dồn từng bit ở `vietqr.ts`. */
function crcByTable(data: string): string {
  const table: number[] = [];
  for (let byte = 0; byte < 256; byte += 1) {
    let crc = byte << 8;
    for (let bit = 0; bit < 8; bit += 1)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    table.push(crc);
  }
  let crc = 0xffff;
  for (const char of data)
    crc = ((crc << 8) & 0xffff) ^ (table[((crc >> 8) ^ char.charCodeAt(0)) & 0xff] as number);
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bóc TLV một tầng: `[tag, value][]` — kiểm ĐỘ DÀI khai báo khớp độ dài thật, lệch là ném lỗi. */
function parseTlv(payload: string): [string, string][] {
  const out: [string, string][] = [];
  let cursor = 0;
  while (cursor < payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const length = Number(payload.slice(cursor + 2, cursor + 4));
    const value = payload.slice(cursor + 4, cursor + 4 + length);
    if (value.length !== length) throw new Error(`TLV lệch độ dài ở tag ${tag}`);
    out.push([tag, value]);
    cursor += 4 + length;
  }
  return out;
}

const INPUT = {
  accountNumber: '0123456789',
  amount: 37500,
  bankBin: '970436',
  note: 'SA ABCD2345',
};

describe('crc16CcittFalse', () => {
  it('vector chuẩn CRC-16/CCITT-FALSE: "123456789" → 29B1', () => {
    expect(crc16CcittFalse('123456789')).toBe('29B1');
  });

  it('chuỗi rỗng → FFFF (giá trị khởi tạo); luôn 4 ký tự HEX IN HOA, có số 0 đứng đầu', () => {
    expect(crc16CcittFalse('')).toBe('FFFF');
    expect(crc16CcittFalse('A')).toMatch(/^[0-9A-F]{4}$/);
  });

  it('khớp bản cài đặt theo bảng tra trên nhiều chuỗi', () => {
    for (const text of ['00020101021238', 'SA ABCD2345', '6304', 'The quick brown fox']) {
      expect(crc16CcittFalse(text)).toBe(crcByTable(text));
    }
  });
});

describe('buildVietQrPayload — QR động (có số tiền)', () => {
  const payload = buildVietQrPayload(INPUT);
  const top = parseTlv(payload);

  it('tag cấp một đúng THỨ TỰ chuẩn: 00 · 01 · 38 · 53 · 54 · 58 · 62 · 63', () => {
    expect(top.map(([tag]) => tag)).toEqual(['00', '01', '38', '53', '54', '58', '62', '63']);
  });

  it('giá trị từng tag: phiên bản, QR động, VND, số tiền, VN', () => {
    const get = (tag: string) => top.find(([t]) => t === tag)?.[1];
    expect(get('00')).toBe('01');
    expect(get('01')).toBe('12');
    expect(get('53')).toBe('704');
    expect(get('54')).toBe('37500');
    expect(get('58')).toBe('VN');
  });

  it('tag 38 (NAPAS): GUID · ngân hàng + tài khoản · dịch vụ QRIBFTTA', () => {
    const merchant = parseTlv(top.find(([t]) => t === '38')?.[1] ?? '');
    expect(merchant.map(([tag]) => tag)).toEqual(['00', '01', '02']);
    expect(merchant[0]?.[1]).toBe('A000000727');
    expect(merchant[2]?.[1]).toBe('QRIBFTTA');
    const beneficiary = parseTlv(merchant[1]?.[1] ?? '');
    expect(beneficiary).toEqual([
      ['00', '970436'],
      ['01', '0123456789'],
    ]);
  });

  it('tag 62 chứa nội dung chuyển khoản ở sub-tag 08', () => {
    expect(parseTlv(top.find(([t]) => t === '62')?.[1] ?? '')).toEqual([['08', 'SA ABCD2345']]);
  });

  it('CRC ở đuôi: "6304" + 4 HEX, tính trên TOÀN BỘ chuỗi kể cả "6304"', () => {
    expect(payload.slice(-8, -4)).toBe('6304');
    expect(hasValidCrc(payload)).toBe(true);
    expect(payload.slice(-4)).toBe(crcByTable(payload.slice(0, -4)));
  });

  it('sửa MỘT ký tự bất kỳ (vd đổi số tiền) là CRC hỏng — không có lối lách', () => {
    const tampered = payload.replace('540537500', '540537501');
    expect(tampered).not.toBe(payload);
    expect(hasValidCrc(tampered)).toBe(false);
  });
});

describe('buildVietQrPayload — biến thể & lỗi đầu vào', () => {
  it('không có số tiền ⇒ QR TĨNH (01=11), không có tag 54', () => {
    const top = parseTlv(buildVietQrPayload({ accountNumber: '0123456789', bankBin: '970436' }));
    expect(top.find(([tag]) => tag === '01')?.[1]).toBe('11');
    expect(top.some(([tag]) => tag === '54')).toBe(false);
    expect(top.some(([tag]) => tag === '62')).toBe(false);
  });

  it('số tài khoản dài 19 số vẫn hợp lệ (độ dài tag lồng nhau tính đúng)', () => {
    const payload = buildVietQrPayload({ ...INPUT, accountNumber: '1234567890123456789' });
    expect(hasValidCrc(payload)).toBe(true);
    expect(parseTlv(payload).map(([tag]) => tag)).toContain('38');
  });

  it.each([
    ['BIN không đủ 6 số', { ...INPUT, bankBin: '97043' }],
    ['BIN có chữ', { ...INPUT, bankBin: '97043A' }],
    ['số tài khoản có ký tự lạ', { ...INPUT, accountNumber: '0123 456' }],
    ['số tài khoản quá ngắn', { ...INPUT, accountNumber: '12345' }],
    ['số tiền 0', { ...INPUT, amount: 0 }],
    ['số tiền lẻ', { ...INPUT, amount: 100.5 }],
    ['nội dung có dấu (nhiều ngân hàng từ chối)', { ...INPUT, note: 'SA ĐÔNG' }],
    ['nội dung quá 25 ký tự', { ...INPUT, note: 'x'.repeat(26) }],
  ])('%s ⇒ ném VietQrError, không sinh QR sai', (_name, input) => {
    expect(() => buildVietQrPayload(input)).toThrow(VietQrError);
  });
});

describe('transferNote', () => {
  it('nội dung chuẩn `SA <mã>` — khớp cách BE đối chiếu settlement', () => {
    expect(transferNote('ABCD2345')).toBe('SA ABCD2345');
  });
});
