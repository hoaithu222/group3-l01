/**
 * Sinh chuỗi VietQR (EMVCo · NAPAS 247 "chuyển nhanh bằng mã QR") — CHẠY TẠI APP,
 * không gọi dịch vụ ngoài: số tài khoản của người nhận không được đưa cho bên thứ
 * ba (p6-04 README §2 "VietQR").
 *
 * Thứ tự tag CỐ ĐỊNH theo chuẩn: 00 · 01 · 38 · 53 · 54 · 58 · 62 · 63.
 *
 *   00 02 01                         phiên bản payload
 *   01 02 12                         12 = QR ĐỘNG (có số tiền) · 11 = QR tĩnh
 *   38 LL                            thông tin đơn vị thụ hưởng (NAPAS)
 *      00 10 A000000727              GUID NAPAS
 *      01 LL                         ngân hàng + tài khoản
 *         00 06 <BIN>               mã BIN 6 số
 *         01 LL <số tài khoản>
 *      02 08 QRIBFTTA                dịch vụ: chuyển nhanh về TÀI KHOẢN
 *   53 03 704                        tiền tệ VND
 *   54 LL <số tiền>                  đồng, số nguyên, KHÔNG dấu chấm/phẩy
 *   58 02 VN
 *   62 LL 08 LL <nội dung>           nội dung chuyển khoản (`SA <mã>`)
 *   63 04 <CRC16>                    CRC-16/CCITT-FALSE trên TOÀN BỘ chuỗi kể cả "6304"
 *
 * ⚠️ CHƯA kiểm bằng app ngân hàng thật (IR-39 — nghiệm thu trên thiết bị). Test
 * hiện có chỉ chứng minh: CRC đúng vector chuẩn `123456789 → 29B1`, cấu trúc TLV
 * đúng thứ tự và độ dài, CRC của chính chuỗi sinh ra tự khớp.
 */

const GUID_NAPAS = 'A000000727';
const SERVICE_TO_ACCOUNT = 'QRIBFTTA';
const CURRENCY_VND = '704';
const NOTE_MAX = 25;

export class VietQrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VietQrError';
  }
}

export interface VietQrInput {
  /** 6 chữ số (mã BIN NAPAS). */
  bankBin: string;
  /** 6–19 chữ số. */
  accountNumber: string;
  /** Đồng, nguyên dương. Bỏ trống ⇒ QR tĩnh (người chuyển tự nhập số tiền). */
  amount?: number;
  /** ASCII in được, ≤ 25 ký tự — nhiều ngân hàng cắt/từ chối nội dung dài hoặc có dấu. */
  note?: string;
}

/**
 * CRC-16/CCITT-FALSE: đa thức 0x1021, khởi tạo 0xFFFF, không đảo bit, không xor cuối.
 * Trả 4 ký tự HEX IN HOA — đúng dạng nhét thẳng vào tag 63.
 * ⚠️ Chỉ đúng cho ASCII (mỗi ký tự = 1 byte); `buildVietQrPayload` đã chặn ký tự khác.
 */
export function crc16CcittFalse(data: string): string {
  let crc = 0xffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** `tag` + độ dài 2 chữ số thập phân + giá trị. Độ dài > 99 không biểu diễn được. */
function tlv(tag: string, value: string): string {
  if (value.length > 99) throw new VietQrError(`Trường ${tag} quá dài cho VietQR`);
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function assertInput({ accountNumber, amount, bankBin, note }: VietQrInput): void {
  if (!/^\d{6}$/.test(bankBin)) throw new VietQrError('Mã ngân hàng phải gồm 6 chữ số');
  if (!/^\d{6,19}$/.test(accountNumber)) throw new VietQrError('Số tài khoản phải gồm 6–19 chữ số');
  if (
    amount !== undefined &&
    (!Number.isInteger(amount) || amount < 1 || amount > 9_999_999_999_999)
  ) {
    throw new VietQrError('Số tiền phải là số nguyên đồng dương');
  }
  if (note !== undefined && (note.length > NOTE_MAX || !/^[\x20-\x7E]*$/.test(note))) {
    throw new VietQrError(
      `Nội dung chuyển khoản chỉ gồm ký tự không dấu, tối đa ${NOTE_MAX} ký tự`,
    );
  }
}

export function buildVietQrPayload(input: VietQrInput): string {
  assertInput(input);
  const { accountNumber, amount, bankBin, note } = input;

  const beneficiary = tlv('00', bankBin) + tlv('01', accountNumber);
  const merchantInfo =
    tlv('00', GUID_NAPAS) + tlv('01', beneficiary) + tlv('02', SERVICE_TO_ACCOUNT);

  const body =
    tlv('00', '01') +
    tlv('01', amount === undefined ? '11' : '12') +
    tlv('38', merchantInfo) +
    tlv('53', CURRENCY_VND) +
    (amount === undefined ? '' : tlv('54', String(amount))) +
    tlv('58', 'VN') +
    (note ? tlv('62', tlv('08', note)) : '');

  // CRC tính trên chuỗi ĐÃ gồm "6304" (tag + độ dài của chính CRC) — quên phần đó là
  // mọi app ngân hàng báo "mã QR không hợp lệ" mà không nói lý do.
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${crc16CcittFalse(withCrcHeader)}`;
}

/** CRC ở đuôi có khớp phần còn lại không — dùng cho test và kiểm nhanh chuỗi đã sinh. */
export function hasValidCrc(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== '6304') return false;
  return crc16CcittFalse(payload.slice(0, -4)) === payload.slice(-4);
}

/** Nội dung chuyển khoản chuẩn: `SA <mã 8 ký tự>` — BE khớp settlement theo mã này. */
export function transferNote(reference: string): string {
  return `SA ${reference}`;
}
