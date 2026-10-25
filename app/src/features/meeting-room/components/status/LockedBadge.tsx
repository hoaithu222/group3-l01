import { Badge } from '@/shared/ui/badge';

export interface LockedBadgeProps {
  className?: string;
}

/** "Đã khoá" — cuộc họp đang khoá, người mới không vào được. Chữ + cam, không chỉ biểu tượng ổ khoá. Nơi gọi tự quyết hiện hay không (`lockedAt`). */
export function LockedBadge({ className }: LockedBadgeProps) {
  return <Badge accessibilityLabel="Cuộc họp đã khoá, người mới không vào được" className={className} label="Đã khoá" variant="warning" />;
}
