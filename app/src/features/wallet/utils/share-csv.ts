import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { WalletCsvFile } from '../api';

export type ShareCsvOutcome = 'shared' | 'unavailable';

/** Tên tệp do BE đặt (`Content-Disposition`) — vẫn lọc: nó đi vào ĐƯỜNG DẪN tệp trên máy. */
function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '');
  return /\.csv$/i.test(cleaned) ? cleaned : `${cleaned || 'wallet'}.csv`;
}

/**
 * Ghi CSV ra thư mục cache rồi mở bảng chia sẻ của hệ điều hành (`expo-sharing`).
 *
 * ⚠️ `expo-file-system/legacy` — bản gốc của SDK 57 đã đổi API (cùng lý do
 * `chat/FileRow`, `resources/resource-files`). Ghi bằng chuỗi UTF-8 để BOM
 * (`\uFEFF`) thành đúng 3 byte EF BB BF — Excel mở tiếng Việt không vỡ dấu.
 * ⛔ Không xoá tệp ngay sau `shareAsync`: trên Android promise trả về lúc intent
 * vừa phát đi, xoá sớm là ứng dụng đích không đọc được. Cache do hệ điều hành dọn.
 */
export async function shareCsvFile(file: WalletCsvFile): Promise<ShareCsvOutcome> {
  const uri = `${FileSystem.cacheDirectory}${safeFileName(file.fileName)}`;
  await FileSystem.writeAsStringAsync(uri, file.text, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Xuất bảng kê ví nhóm',
    UTI: 'public.comma-separated-values-text',
  });
  return 'shared';
}
