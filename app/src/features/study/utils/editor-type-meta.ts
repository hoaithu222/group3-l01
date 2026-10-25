import type { IconTileTone } from '@/shared/ui/icon-tile';

import type { StudyItemType } from '../api/study.types';

/**
 * Bản sắc HIỂN THỊ của từng dạng mục trong trình soạn — bổ sung cho `ITEM_TYPE_META` (icon + tên đầy đủ, ở
 * `constants/study.constants.ts`) những thứ chỉ trình soạn cần: tông màu ô icon, mô tả một dòng, tên ngắn cho thanh tóm tắt.
 * Danh sách dạng mục, thẻ chọn dạng, dòng danh sách và đầu form cùng đọc bảng này nên một dạng LUÔN cùng màu + chữ.
 *
 * ⚠️ Tông chỉ để PHÂN BIỆT cho sinh động (xoay vòng bộ tông của `IconTile`, đã đo tương phản cả sáng lẫn tối); ⛔ không mang nghĩa
 * trạng thái và ⛔ không phải kênh thông tin duy nhất — mọi nơi dùng đều kèm icon + tên dạng.
 */
export const ITEM_TYPE_TONE: Record<StudyItemType, IconTileTone> = {
  FILL_BLANK: 'warning',
  FLASHCARD: 'brand',
  MULTI_SELECT: 'success',
  MULTIPLE_CHOICE: 'info',
  TRUE_FALSE: 'accent',
};

/**
 * Mô tả MỘT dòng của dạng mục. Cố ý không nêu con số giới hạn (số lựa chọn tối đa…): giới hạn đến từ `readStudyLimits`
 * (`capabilities`), chép vào chữ là nó lệch ngay khi server đổi.
 */
export const ITEM_TYPE_HINT: Record<StudyItemType, string> = {
  FILL_BLANK: 'Người học gõ đáp án, chấp nhận nhiều cách viết',
  FLASHCARD: 'Mặt trước – mặt sau, lật thẻ để học',
  MULTI_SELECT: 'Chọn tất cả các đáp án đúng',
  MULTIPLE_CHOICE: 'Một câu hỏi, chọn đúng MỘT đáp án',
  TRUE_FALSE: 'Một nhận định, chọn Đúng hoặc Sai',
};

/** Tên ngắn cho thanh tóm tắt ("5 thẻ ghi nhớ · 4 trắc nghiệm") — viết thường khi đứng sau con số. */
export const ITEM_TYPE_SHORT: Record<StudyItemType, string> = {
  FILL_BLANK: 'điền chỗ trống',
  FLASHCARD: 'thẻ ghi nhớ',
  MULTI_SELECT: 'nhiều đáp án',
  MULTIPLE_CHOICE: 'trắc nghiệm',
  TRUE_FALSE: 'đúng / sai',
};
