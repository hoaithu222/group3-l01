import { EmptyState, type EmptyStateActionProps } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

export type UnsupportedReason =
  'error' | 'no-native-pdf' | 'no-preview' | 'too-large' | 'unsupported';

const COPY: Record<UnsupportedReason, { description: string; title: string }> = {
  unsupported: {
    description:
      'Loại tệp này chưa xem trực tiếp được. Bạn có thể mở bằng ứng dụng khác hoặc tải về.',
    title: 'Chưa xem trước được',
  },
  'no-preview': {
    description: 'Tệp này chưa có bản xem trước. Bạn có thể mở bằng ứng dụng khác hoặc tải về.',
    title: 'Chưa có bản xem trước',
  },
  'no-native-pdf': {
    description:
      'Ứng dụng chưa hỗ trợ xem PDF trực tiếp trên thiết bị này. Hãy mở bằng ứng dụng khác.',
    title: 'Không xem PDF trong ứng dụng được',
  },
  'too-large': {
    description: 'Tệp lớn hơn giới hạn xem trước. Hãy tải về để đọc.',
    title: 'Tệp quá lớn để xem trước',
  },
  error: {
    description: 'Có sự cố khi mở tệp này. Thử lại hoặc tải về để xem.',
    title: 'Không mở được tệp',
  },
};

/**
 * Hình minh hoạ theo lý do: chỉ `error` là LỖI thật (cảnh báo đỏ); bốn lý do còn lại là "chưa xem trước được" — không phải
 * lỗi của ai, đã có lối thoát ở `actions` — nên dùng icon tệp tông trung tính, đừng tô đỏ làm người dùng tưởng tệp hỏng.
 */
const ART: Record<UnsupportedReason, { icon: IconName; tone: IconTileTone }> = {
  error: { icon: 'alert-warning', tone: 'danger' },
  'no-native-pdf': { icon: 'document', tone: 'neutral' },
  'no-preview': { icon: 'document', tone: 'neutral' },
  'too-large': { icon: 'document', tone: 'neutral' },
  unsupported: { icon: 'document', tone: 'neutral' },
};

export interface UnsupportedPreviewProps {
  /** Hành động của màn cha: "Mở bằng ứng dụng khác", "Tải về", "Thử lại". */
  actions: readonly EmptyStateActionProps[];
  reason: UnsupportedReason;
}

/**
 * Khung "không xem trước được" dùng chung: loại tệp chưa hỗ trợ (DOC/SHEET/SLIDE ở
 * P0), thiếu native module PDF (đường lui khi dev-client chưa build lại), tệp mã
 * quá giới hạn, lỗi mở. Luôn có lối thoát là hành động — không để người dùng
 * kẹt ở màn trống.
 */
export function UnsupportedPreview({ actions, reason }: UnsupportedPreviewProps) {
  const copy = COPY[reason];
  const art = ART[reason];
  return (
    <EmptyState
      actions={actions}
      description={copy.description}
      icon={art.icon}
      title={copy.title}
      tone={art.tone}
    />
  );
}
