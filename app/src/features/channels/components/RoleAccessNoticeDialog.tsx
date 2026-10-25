import { Dialog } from '@/shared/ui/modal';

import { describeAccessSources } from '../utils/access-source';

export interface RoleAccessNotice {
  name: string;
  /** `effectiveSources` của người đó SAU khi gỡ quyền trực tiếp. */
  sources: string[];
}

export interface RoleAccessNoticeDialogProps {
  notice: RoleAccessNotice | null;
  onClose: () => void;
}

/**
 * PR-05 (app.md p3-04 §3): vừa gỡ quyền TRỰC TIẾP mà người đó vẫn đọc được vì còn được cấp
 * qua vai trò → giải thích ngay. Không có hộp thoại này thì người quản lý thấy dòng biến mất
 * khỏi danh sách rồi người kia vẫn nhắn được trong kênh, và kết luận thao tác gỡ bị hỏng.
 */
export function RoleAccessNoticeDialog({ notice, onClose }: RoleAccessNoticeDialogProps) {
  return (
    <Dialog
      description={
        notice
          ? `Quyền trực tiếp đã được gỡ, nhưng ${describeAccessSources(notice.sources).toLowerCase()} nên người này vẫn xem được kênh. Muốn họ mất quyền hẳn, hãy tắt "Cấp theo vai trò" tương ứng.`
          : ''
      }
      primaryAction={{ label: 'Đã hiểu', onPress: onClose }}
      title={notice ? `${notice.name} vẫn xem được kênh này` : ''}
      variant="warning"
      visible={notice !== null}
      onClose={onClose}
    />
  );
}
