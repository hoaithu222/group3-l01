import { EmptyState } from '@/shared/ui/empty-state';

import { formatSize } from '../../utils/format-size';

export interface MeteredGateProps {
  onAllow: () => void;
  size: number;
}

/** Hỏi trước khi tải tệp lớn qua dữ liệu di động (app.md p3-01 §7) — không tự tải, không chặn hẳn. */
export function MeteredGate({ onAllow, size }: MeteredGateProps) {
  return (
    <EmptyState
      actions={[{ label: 'Tiếp tục xem', onPress: onAllow }]}
      description={`Tệp nặng ${formatSize(size)} và bạn đang dùng dữ liệu di động. Kết nối Wi-Fi để tiết kiệm dung lượng, hoặc tiếp tục nếu bạn đồng ý.`}
      icon="arrow-down"
      title="Tải tệp lớn?"
      tone="warning"
    />
  );
}
