/**
 * Che dữ liệu cá nhân để HIỂN THỊ — `•••• 7890`.
 *
 * ── ⚠️ KHÁC HẲN `redactSecrets` ─────────────────────────────────────────────
 * `redactSecrets` (`src/core/api/client.helpers.ts`) che trong LOG: nó thay CẢ
 * giá trị bằng `'***'` để token không rơi vào Sentry. Ở đây thì ngược lại —
 * người dùng PHẢI nhận ra được tài khoản của chính mình, nên bốn số cuối được
 * giữ nguyên. Đừng dùng lẫn hai thứ: che log bằng hàm ở đây là rò rỉ, che màn
 * hình bằng `redactSecrets` là người dùng không biết mình đang chuyển từ tài
 * khoản nào.
 *
 * ── ⛔ Trợ năng: chuỗi che KHÔNG tự đọc được ─────────────────────────────────
 * Trình đọc màn hình đọc `•` từng ký tự một ("chấm chấm chấm chấm một hai ba
 * bốn") hoặc bỏ qua hẳn. Mọi chỗ hiển thị chuỗi che PHẢI kèm một
 * `accessibilityLabel` viết thành lời — theo đúng tiền lệ `spokenLabel` của
 * `AccountCard`:
 *
 *     <Text accessibilityLabel={`Tài khoản đuôi ${account.slice(-4)}`}>
 *       {maskAccountNumber(account)}
 *     </Text>
 *
 * ── ⚠️ Vì sao `•` (U+2022) chứ không phải `*` ───────────────────────────────
 * 1. `*` là ký tự ĐẠI DIỆN (wildcard) và ký hiệu chú thích chân trang — người
 *    dùng đọc `**** 7890` như một ghi chú, không phải như phần bị giấu.
 * 2. `*` được font đặt ở NỬA TRÊN của dòng (như số mũ), nên `**** 7890` trông
 *    lệch hẳn lên so với dãy số bên cạnh; `•` nằm giữa dòng, thẳng hàng với chữ
 *    số — đúng thứ bản vẽ vẽ và đúng thứ ô mật khẩu của iOS/Android dùng.
 * 3. Trình đọc màn hình đọc `*` thành "sao" từng cái một, dài và vô nghĩa. (`•`
 *    cũng không khá hơn — xem khối trợ năng ở trên, lối thoát là
 *    `accessibilityLabel`.)
 */

/** Ký tự che. ⛔ Không đổi sang `*` — xem lý do ở đầu file. */
export const MASK_CHAR = '•';

/**
 * Số ký tự che LUÔN CỐ ĐỊNH, không theo độ dài thật.
 *
 * ⚠️ Chấm chạy theo độ dài thật là rò rỉ ngược: số tài khoản 9 chữ số, 12 chữ
 * số hay 14 chữ số là dấu hiệu nhận ra NGÂN HÀNG phát hành, và đếm chấm trên
 * ảnh chụp màn hình là đủ để biết. Bốn chấm cho mọi trường hợp.
 */
const MASK_GROUP = MASK_CHAR.repeat(4);

/** Bốn số cuối — vừa đủ để người dùng nhận ra tài khoản của mình, đúng bản vẽ. */
const VISIBLE_TAIL = 4;

/**
 * Bỏ khoảng trắng và dấu nhóm có sẵn trước khi che.
 *
 * ⚠️ Bắt buộc: API trả `'1234 5678 9012'` còn người dùng dán vào `'1234-5678'`.
 * Không dọn thì `slice(-4)` cắt trúng dấu cách và ra `' 012'` — lệch một ký tự,
 * và ca này chỉ lộ ra với đúng những chuỗi có sẵn dấu nhóm.
 */
const SEPARATORS = /[\s\u00A0.\-–—_]/g;

function compact(value: string | null | undefined): string {
  return value ? value.replace(SEPARATORS, '') : '';
}

/**
 * Che số tài khoản, giữ `visible` ký tự cuối.
 *
 * ⚠️ Chuỗi NGẮN HƠN phần cần giữ thì trả về NGUYÊN VĂN, không che: che một
 * chuỗi 3 ký tự chỉ ra `••••` — mất sạch thông tin mà chẳng giấu thêm được gì
 * (người xem vẫn biết đó là tài khoản nào qua ngữ cảnh xung quanh).
 *
 * @example
 *   maskAccountNumber('1234567890')      // '•••• 7890'
 *   maskAccountNumber('1234 5678 90')    // '•••• 7890'  (dọn dấu nhóm trước)
 *   maskAccountNumber('123')             // '123'        (quá ngắn ⇒ không che)
 *   maskAccountNumber(undefined)         // ''
 */
export function maskAccountNumber(
  value: string | null | undefined,
  visible: number = VISIBLE_TAIL,
): string {
  const clean = compact(value);
  const keep = Math.max(0, visible);
  if (clean.length <= keep) return clean;

  /**
   * ⛔ `clean.slice(-keep)`, KHÔNG phải `clean.slice(clean.length - keep)`, là
   * một lỗ RÒ RỈ thật: `-0 === 0` nên `slice(-0)` trả về NGUYÊN chuỗi. Gọi
   * `maskAccountNumber(stk, 0)` — nghĩa là "che hết" — sẽ in ra `•••• ` kèm
   * TOÀN BỘ số tài khoản, và không có gì báo lỗi. Đếm từ đầu chuỗi thì `0` là
   * `0`.
   */
  const tail = clean.slice(clean.length - keep);
  return tail ? `${MASK_GROUP} ${tail}` : MASK_GROUP;
}

/**
 * Che số thẻ theo khuôn 4-4-4-4 quen thuộc của thẻ ngân hàng.
 *
 * ⚠️ Luôn vẽ ĐỦ ba nhóm chấm kể cả với thẻ 15 số (Amex): khuôn hình phải giống
 * nhau ở mọi thẻ, nếu không hàng thẻ trong danh sách so le nhau. Số chấm ở đây
 * là TRANG TRÍ, không phải số ký tự thật — xem `MASK_GROUP`.
 *
 * @example
 *   maskCardNumber('1234567812341234')   // '•••• •••• •••• 1234'
 *   maskCardNumber('1234')               // '1234'   (chỉ có 4 số ⇒ không che)
 */
export function maskCardNumber(value: string | null | undefined): string {
  const clean = compact(value);
  if (clean.length <= VISIBLE_TAIL) return clean;
  return `${MASK_GROUP} ${MASK_GROUP} ${MASK_GROUP} ${clean.slice(-VISIBLE_TAIL)}`;
}

/** Giữ đầu số (4) — người dùng nhận ra nhà mạng — và 3 số cuối. */
const PHONE_HEAD = 4;
const PHONE_TAIL = 3;

/**
 * Che số điện thoại: `'0912345678'` → `'0912•••678'`.
 *
 * ⚠️ Bản vẽ hiện số điện thoại KHÔNG che ở màn thông tin đơn hàng
 * (`0999999999`, không nhóm, không che) — hàm này dành cho màn OTP và màn xác
 * nhận, nơi phải nhắc "mã đã gửi tới số nào" mà không phơi cả số ra cho người
 * đứng cạnh. ⛔ Đừng bọc nó vào chỗ bản vẽ đã nói rõ là hiện nguyên.
 *
 * Không chèn dấu cách: bản vẽ không nhóm số điện thoại.
 */
export function maskPhone(value: string | null | undefined): string {
  const clean = compact(value);
  if (clean.length <= PHONE_HEAD + PHONE_TAIL) return clean;
  return `${clean.slice(0, PHONE_HEAD)}${MASK_CHAR.repeat(3)}${clean.slice(-PHONE_TAIL)}`;
}

/**
 * Che tên: giữ chữ cái ĐẦU của mỗi từ, phần còn lại thành chấm.
 *
 * `'Nguyễn Văn An'` → `'N••••• V•• A•'` — đủ để người dùng soi thấy tên người
 * nhận đúng như họ vừa nhập, không đủ cho người đứng cạnh đọc trộm.
 *
 * ⚠️ `normalize('NFC')` là bắt buộc, không phải cho đẹp: chuỗi tiếng Việt dạng
 * NFD tách `ễ` thành `e` + hai dấu tổ hợp, nên `'Nguyễn'.length` là 8 chứ không
 * phải 6 và tên bị vẽ thừa hai chấm. Bàn phím iOS và một số backend trả về NFD.
 *
 * ⚠️ Số chấm ở đây CÓ chạy theo độ dài thật — khác `maskAccountNumber`. Độ dài
 * một cái tên không phải thông tin nhạy cảm, mà giữ đúng độ dài là thứ giúp
 * người dùng nhận ra tên mình.
 */
export function maskName(value: string | null | undefined): string {
  const words = (value ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  return words.map((word) => word.slice(0, 1) + MASK_CHAR.repeat(word.length - 1)).join(' ');
}
