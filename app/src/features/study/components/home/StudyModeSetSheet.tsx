import { router } from 'expo-router';
import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { StudySetSummaryDto } from '../../api/study.types';
import { STUDY_MODE_META } from '../../constants/study-modes.constants';
import { flashcardsHref, mockSetupHref, quizHref } from '../../utils/study-routes';
import { SetCoverThumb } from '../visual/SetCoverThumb';

/** Ba chế độ CẦN một bộ để bắt đầu; `sr` (mọi bộ đã đăng ký) và `live` (nhập mã PIN) không cần nên không qua tấm này. */
export type SetPickMode = 'flashcards' | 'mock' | 'quick';

/**
 * Chờ tấm đóng xong rồi mới điều hướng — cùng số với `ActionMenuSheet` (`CLOSE_DURATION_MS` 200 ms + 30 ms đệm; hằng số đó không xuất
 * ra ngoài `shared/ui`). Điều hướng ngay khi tấm còn đang trượt xuống thì Android nuốt cú chạm/`Modal` tranh cửa sổ với màn mới.
 */
const SHEET_CLOSE_WAIT_MS = 230;

const COPY: Record<SetPickMode, { empty: string; title: string }> = {
  flashcards: { empty: 'Các bộ của bạn chưa có mục nào để học thẻ.', title: 'Chọn bộ để học thẻ' },
  mock: {
    empty: 'Chưa có bộ nào có câu hỏi chấm điểm được để thi thử.',
    title: 'Chọn bộ để thi thử',
  },
  quick: {
    empty: 'Chưa có bộ nào có câu hỏi chấm điểm được để chơi Quiz nhanh.',
    title: 'Chọn bộ để chơi Quiz nhanh',
  },
};

/**
 * ⚠️ if/else chứ KHÔNG `cond ? mockSetupHref(id) : flashcardsHref(id)`: hai `Href` trong MỘT biểu thức điều kiện làm union kiểu vượt giới hạn của TypeScript
 * (TS2590 — union `Href` đã phình theo ~190 route; xem `AGENTS.md` mục typecheck).
 */
function openForMode(mode: SetPickMode | null, setId: string): void {
  if (mode === 'mock') {
    router.push(mockSetupHref(setId));
    return;
  }
  if (mode === 'quick') {
    router.push(quizHref(setId));
    return;
  }
  router.push(flashcardsHref(setId));
}

export interface StudyModeSetSheetProps {
  /** Còn trang chưa tải — tấm chỉ liệt kê các bộ ĐÃ tải, nên nhắc dùng ô tìm kiếm cho bộ còn lại. */
  hasMore: boolean;
  /** `null` = đóng. */
  mode: SetPickMode | null;
  sets: readonly StudySetSummaryDto[];
  status: 'error' | 'loading' | 'ready';
  onClose: () => void;
}

/**
 * Tấm chọn BỘ cho ba lối tắt cần bộ ở Trang chủ Học ("Học thẻ", "Quiz nhanh", "Thi thử"): liệt kê bộ của tôi đã tải (cùng khoá cache với danh sách
 * ở dưới ⇒ không gọi thêm API), chọn một bộ ⇒ đóng tấm rồi mở thẳng màn học/thi thử của bộ đó — bớt hai lần chạm so với "mở bộ → tìm
 * nút". Biểu tượng + tông của mỗi hàng lấy từ `STUDY_MODE_META` để tấm nhìn ra cùng chế độ với ô đã bấm.
 *
 * Lọc theo NĂNG LỰC thật của bộ (do server báo): học thẻ cần `itemCount > 0`; thi thử và Quiz nhanh cần `hasQuiz` (có ít nhất một câu chấm được)
 * — bộ không đủ điều kiện thì không có trong tấm thay vì để người dùng chọn rồi mới báo lỗi.
 */
export function StudyModeSetSheet({
  hasMore,
  mode,
  onClose,
  sets,
  status,
}: StudyModeSetSheetProps) {
  const copy = mode ? COPY[mode] : null;
  const needsQuiz = mode === 'mock' || mode === 'quick';
  const usable = sets.filter((set) => (needsQuiz ? set.hasQuiz : set.itemCount > 0));

  const choose = (set: StudySetSummaryDto) => {
    onClose();
    setTimeout(() => openForMode(mode, set.id), SHEET_CLOSE_WAIT_MS);
  };

  return (
    <BottomSheet
      description={hasMore ? 'Mới hiện các bộ đã tải — dùng ô tìm kiếm để tìm bộ khác.' : undefined}
      padded={false}
      scrollable
      title={copy?.title}
      visible={mode !== null}
      onClose={onClose}
    >
      {status === 'loading' ? (
        // ✅ Khung chờ theo HÌNH của hàng thật (ảnh bìa + tên bộ + "N mục") — ❌ bản trước là ba khối xám liền, tải xong thì cả
        // tấm "nhảy" sang một bố cục khác hẳn.
        <View accessibilityLabel="Đang tải danh sách bộ" className="gap-md px-md pb-md">
          <SkeletonParagraphWithIcon />
          <SkeletonParagraphWithIcon />
          <SkeletonParagraphWithIcon />
        </View>
      ) : usable.length === 0 ? (
        <EmptyState
          description={
            status === 'error'
              ? 'Không tải được danh sách bộ học. Đóng tấm này rồi bấm "Thử lại" ở danh sách bên dưới.'
              : (copy?.empty ?? '')
          }
          icon={mode ? STUDY_MODE_META[mode].icon : 'book'}
          size="compact"
          title={status === 'error' ? 'Chưa có danh sách' : 'Chưa có bộ phù hợp'}
          tone={mode ? STUDY_MODE_META[mode].tone : 'brand'}
        />
      ) : (
        <SheetList accessibilityLabel={copy?.title} accessibilityRole="menu" className="pb-md">
          {usable.map((set, index) => (
            <ListItem
              key={set.id}
              className="items-center"
              description={`${set.itemCount} mục`}
              divider={index < usable.length - 1}
              emphasis="title"
              label={set.title}
              labelNumberOfLines={2}
              leading={<SetCoverThumb size="sm" title={set.title} uri={set.coverThumbUrl} />}
              onPress={() => choose(set)}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
