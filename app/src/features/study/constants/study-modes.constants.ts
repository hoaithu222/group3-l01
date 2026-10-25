import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

export type StudyModeKey = 'flashcards' | 'live' | 'mock' | 'quick' | 'sr';

/**
 * Bản sắc của MỘT chế độ học — Trang chủ, tổng quan bộ, phiên học và màn kết quả cùng đọc bảng này để một chế độ LUÔN cùng màu +
 * icon + tên: người học nhận ra "đây là thi thử" bằng mắt trước khi đọc chữ, và không màn nào tự chọn một cặp màu riêng.
 *
 * ── Về tông màu ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * Bốn tông chỉ để PHÂN BIỆT chế độ, không mang nghĩa trạng thái (`IconTile` giải thích vì sao chỉ có bảy tông đã đo tương phản).
 * ⛔ Không dùng `danger` — dành riêng cho lỗi/phá huỷ. ⛔ Không dùng tông này làm dấu hiệu DUY NHẤT: luôn có `label` bên cạnh
 * (`mobile-ux.md` — màu không phải kênh thông tin duy nhất).
 *
 * `label`/`description` giữ NGUYÊN câu chữ đang dùng ở `SetStudyActions` và `StudyHomeMenu` để không đổi thuật ngữ sản phẩm.
 */
export const STUDY_MODE_META: Record<
  StudyModeKey,
  { description: string; icon: IconName; label: string; tone: IconTileTone }
> = {
  flashcards: {
    description: 'Lật thẻ, tự chấm mức nhớ',
    icon: 'copy',
    label: 'Học thẻ',
    tone: 'brand',
  },
  live: {
    description: 'Đấu cùng bạn bè theo thời gian thực',
    icon: 'flash',
    label: 'Thi đấu trực tiếp',
    tone: 'warning',
  },
  mock: {
    description: 'Làm bài trắc nghiệm có tính giờ',
    icon: 'timer',
    label: 'Thi thử',
    tone: 'info',
  },
  // Luyện tập TẠI MÁY (không ghi điểm/XP lên server): tông `accent` để tách khỏi Học thẻ (brand), Thi thử (info) và Ôn theo lịch (success);
  // icon `play` vì `flash` đã thuộc "Thi đấu trực tiếp".
  quick: {
    description: 'Trả lời từng câu, biết đúng sai ngay',
    icon: 'play',
    label: 'Quiz nhanh',
    tone: 'accent',
  },
  sr: {
    description: 'Ôn thẻ đến hạn theo lịch nhớ',
    icon: 'calendar-favorite',
    label: 'Ôn theo lịch',
    tone: 'success',
  },
};
