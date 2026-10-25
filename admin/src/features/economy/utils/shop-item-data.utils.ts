import dayjs from 'dayjs';

/** Danh sách emoji nhập trong MỘT ô: cách nhau bằng dấu cách / xuống dòng / dấu phẩy; bỏ mục rỗng. */
export const parseEmojis = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

/** Ngày `YYYY-MM-DD` (giờ máy) của một mốc ISO — giá trị của `DateRangeField`; `null` = không giới hạn. */
export const isoToDay = (iso: string | null): string | null =>
  iso ? dayjs(iso).format('YYYY-MM-DD') : null;

/** Mốc bắt đầu bán = 00:00 của ngày đã chọn (giờ máy), gửi BE dạng ISO. */
export const dayToStartIso = (day: string): string => dayjs(day).startOf('day').toISOString();

/** Mốc kết thúc bán = 23:59:59.999 của ngày đã chọn — chọn cùng một ngày cho "từ" và "đến" vẫn là khung hợp lệ (`from < to`). */
export const dayToEndIso = (day: string): string => dayjs(day).endOf('day').toISOString();
