/**
 * Tên ngắn ngân hàng theo BIN NAPAS — chỉ để HIỂN THỊ (`bankName` trong response).
 * BIN thực sự đưa vào mã QR do app ghép từ bảng riêng của app. CHƯA đối chiếu với danh sách
 * chính thức của NAPAS: cần rà soát tay trước khi bật `wallet` ở production; BIN lạ → `null`.
 */
const VN_BANKS: Record<string, string> = {
  "970436": "Vietcombank",
  "970415": "VietinBank",
  "970418": "BIDV",
  "970405": "Agribank",
  "970407": "Techcombank",
  "970422": "MB Bank",
  "970416": "ACB",
  "970432": "VPBank",
  "970423": "TPBank",
  "970403": "Sacombank",
  "970437": "HDBank",
  "970441": "VIB",
  "970443": "SHB",
  "970431": "Eximbank",
  "970426": "MSB",
  "970448": "OCB",
  "970440": "SeABank",
  "970449": "LPBank",
  "970428": "Nam A Bank",
  "970409": "Bac A Bank",
  "970425": "ABBANK",
  "970412": "PVcomBank",
  "970433": "VietBank",
};

export function bankNameOf(bin: string): string | null {
  return VN_BANKS[bin] ?? null;
}

/**
 * Chuẩn hoá tên chủ TK theo NAPAS: IN HOA, bỏ dấu tiếng Việt, chỉ giữ chữ cái + khoảng trắng.
 */
export function normalizeAccountName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
