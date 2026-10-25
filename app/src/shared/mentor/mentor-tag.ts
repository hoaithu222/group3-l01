/** Giá trị `WorkspaceMembership.displayTag` mà BE gắn cho cố vấn (`MENTOR_DISPLAY_TAG` ở `be/src/modules/mentor/entities/mentor.interface.ts`). */
export const MENTOR_DISPLAY_TAG = 'MENTOR';

/**
 * Thành viên này đang là cố vấn? Cần CẢ nhãn LẪN vai KHÁCH: cố vấn luôn là khách có hạn, còn nhãn sót lại trên người đã được nâng vai thì
 * không được che vai thật của họ. Nhãn lạ (loại khác về sau) ⇒ `false`, không vẽ gì.
 */
export function isMentorTag(displayTag: string | null | undefined, role?: string): boolean {
  return displayTag === MENTOR_DISPLAY_TAG && (role === undefined || role === 'GUEST');
}
