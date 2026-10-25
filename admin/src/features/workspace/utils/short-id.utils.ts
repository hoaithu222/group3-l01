/** Mã rút gọn của một id: `#` + 6 ký tự cuối (đủ phân biệt trong một nhóm, không lộ id đầy đủ). */
export const shortId = (id: string): string => `#${id.slice(-6)}`;
