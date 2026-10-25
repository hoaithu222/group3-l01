import { Alert } from '@/shared/ui/alert';

import type { WorkspaceArchiveReason } from '../api';

export interface ArchivedBannerProps {
  reason: WorkspaceArchiveReason | null;
  className?: string;
}

/**
 * Banner "Nhóm đã lưu trữ" (app.md p1-01 §3 cột "Mất quyền") dùng chung cho tổng
 * quan và cài đặt. Hai lý do khác nhau về việc AI khôi phục được: `MANUAL` do
 * chủ nhóm tự lưu trữ (chủ nhóm khôi phục lại), `PLATFORM` do quản trị nền tảng
 * (chỉ họ khôi phục) — nói rõ để người dùng không tìm nút "Khôi phục" không có.
 */
export function ArchivedBanner({ reason, className }: ArchivedBannerProps) {
  const platform = reason === 'PLATFORM';

  return (
    <Alert
      className={className}
      description={
        platform
          ? 'Nhóm bị lưu trữ bởi quản trị nền tảng, chỉ quản trị nền tảng khôi phục được. Liên hệ hỗ trợ để biết thêm.'
          : 'Nhóm đã được lưu trữ — chỉ đọc, không thể gửi tin hoặc mời thêm thành viên.'
      }
      title={platform ? 'Nhóm bị lưu trữ bởi quản trị' : 'Nhóm đã lưu trữ'}
      tone="warning"
    />
  );
}
