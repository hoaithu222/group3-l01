import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Tệp `.ics` TẠM để đưa cho lịch/ứng dụng khác — nằm riêng một thư mục trong cache của app, mỗi cuộc họp MỘT tệp (`meeting-<mã>.ics`, ghi đè ở lần
 * thêm sau) nên không tích tệp. ⚠️ `expo-file-system/legacy` (SDK 57 đổi API gốc sang `File`/`Directory`; cùng lý do `meeting-recap/utils/recording-files.ts`).
 * ⛔ Không xoá tệp ngay sau `shareAsync`: Android trả promise lúc intent vừa phát đi, ứng dụng đích chưa chắc đã đọc xong. Cache do hệ điều hành dọn.
 */
const ICS_DIR = `${FileSystem.cacheDirectory ?? ''}meeting-ics/`;

/**
 * Có gì để thêm vào lịch không: cuộc họp CHƯA diễn ra và người xem đọc được chi tiết. `isMetadataOnly` (OWNER/ADMIN nhóm không tham dự họp riêng tư) ⇒ BE
 * từ chối `GET /ics` (thiếu `meeting.detail.read`, 403) và cũng lược agenda/địa điểm/link — ẩn nút thay vì cho bấm rồi báo lỗi. `LIVE`/`ENDED`/`CANCELLED`:
 * thêm một sự kiện đã bắt đầu/đã qua/đã huỷ vào lịch chỉ làm rác.
 */
export function canAddToCalendar(meeting: { isMetadataOnly: boolean; status: string }): boolean {
  return !meeting.isMetadataOnly && meeting.status === 'SCHEDULED';
}

/**
 * Ghi nội dung `.ics` ra tệp cache rồi mở bảng chia sẻ của hệ điều hành (`expo-sharing`) — nơi người dùng chọn Lịch/Google Calendar/Gmail/Tệp… `true` =
 * đã mở bảng; `false` = thiết bị không hỗ trợ chia sẻ tệp (nơi gọi báo cho người dùng). Mọi lỗi ghi tệp/mở bảng gói lại thành MỘT câu tiếng Việt: thông điệp
 * gốc của `expo-modules` là tiếng Anh kỹ thuật ("Failed to share the file: …") không nên lộ ra giao diện.
 */
export async function openIcsWithSystem(ics: string, code: string): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    await FileSystem.makeDirectoryAsync(ICS_DIR, { intermediates: true });
    const uri = `${ICS_DIR}meeting-${code.replace(/[^\w-]/g, '_')}.ics`;
    await FileSystem.writeAsStringAsync(uri, ics, { encoding: 'utf8' });
    await Sharing.shareAsync(uri, {
      dialogTitle: 'Thêm vào lịch',
      mimeType: 'text/calendar',
      // iOS chọn app theo UTI: `public.calendar-event` là kiểu của tệp `.ics` — thiếu thì bảng chia sẻ không đưa "Thêm vào Lịch".
      UTI: 'public.calendar-event',
    });
    return true;
  } catch {
    throw new Error('Không mở được tệp lịch trên thiết bị này. Hãy thử lại.');
  }
}
