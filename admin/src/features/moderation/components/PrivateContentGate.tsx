import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';

import { Button, Callout, ConfirmDialog, Skeleton } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';
import { formatDate } from '@/shared/utils/format';

import { moderationKeys, usePrivateContent } from '../service/moderation.queries';
import type { ModerationMessage } from '../types/moderation.types';
import { errorCodeOf, MOD_ACCESS_EXPIRED, MOD_NOT_ALLOWED } from '../utils/report-errors';
import ModerationMessageList from './ModerationMessageList';

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

export interface PrivateContentGateProps {
  reportId: string;
  /** `moderation:approve` — thiếu thì KHÔNG có nút xem nội dung (MOD-05 phía giao diện). */
  canApprove: boolean;
  canRemove: boolean;
  onRemove: (message: ModerationMessage) => void;
}

/** Tiêu đề + mô tả cho lỗi của luồng D-06 — `MOD_004`/`MOD_005` là trạng thái bình thường, không phải sự cố. */
function describeError(error: unknown): { title: string; description: string; retry: boolean } {
  const code = errorCodeOf(error);
  if (code === MOD_ACCESS_EXPIRED) {
    return {
      title: 'Quyền xem đã hết hạn',
      description:
        'Báo cáo đã được xử lý quá thời hạn cho phép xem nội dung riêng tư. Các thông tin khác của báo cáo vẫn xem được ở trang này.',
      retry: false,
    };
  }
  if (code === MOD_NOT_ALLOWED) {
    return {
      title: 'Không có quyền xem nội dung này',
      description:
        'Đích của báo cáo không phải tin nhắn trong phạm vi riêng tư, hoặc tài khoản của bạn không được phép xem.',
      retry: false,
    };
  }
  if ((error as AxiosError | undefined)?.response?.status === 404) {
    return {
      title: 'Không tìm thấy nội dung',
      description: 'Tin nhắn có thể đã bị xoá khỏi hệ thống.',
      retry: false,
    };
  }
  return {
    title: 'Không tải được nội dung',
    description: 'Lần xem này có thể đã được ghi nhật ký. Xác nhận lại để thử lần nữa.',
    retry: true,
  };
}

/**
 * Cổng xem nội dung riêng tư (D-06, admin.md p1-08 §2.2). Ba tầng:
 *  1. thiếu `moderation:approve` → chỉ có lời giải thích, KHÔNG nút;
 *  2. đủ quyền → nút "Xem nội dung (được ghi nhật ký)" mở hộp xác nhận nêu rõ hệ quả;
 *  3. chỉ SAU KHI xác nhận mới gọi `GET .../content` (mỗi lần gọi = 1 dòng audit + thông báo người
 *     trong cuộc). Lỗi `MOD_004`/`MOD_005` hiện ngay trong khối; `accessExpiresAt` hiện dưới nội dung.
 *
 * Trạng thái "đã xác nhận" là `useState` cục bộ nên rời trang/đổi báo cáo là mất — muốn xem lại
 * phải xác nhận lại. Nội dung cũng bị xoá khỏi cache khi rời khỏi khối này.
 */
const PrivateContentGate = memo(function PrivateContentGate({
  reportId,
  canApprove,
  canRemove,
  onRemove,
}: PrivateContentGateProps) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const confirmDialog = useDisclosure();
  const { data, isLoading, error } = usePrivateContent(reportId, confirmed);

  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: moderationKeys.content(reportId) });
    },
    [queryClient, reportId],
  );

  const handleConfirm = useCallback(() => setConfirmed(true), []);
  const handleRetry = useCallback(() => {
    queryClient.removeQueries({ queryKey: moderationKeys.content(reportId) });
    setConfirmed(false);
  }, [queryClient, reportId]);

  if (!canApprove) {
    return (
      <Callout
        description="Bạn không có quyền xem nội dung riêng tư. Trang này chỉ hiển thị thông tin mô tả báo cáo."
        icon="lock-bold"
        intent="warning"
        title="Nội dung thuộc phạm vi riêng tư"
      />
    );
  }

  if (!confirmed) {
    return (
      <>
        <Callout
          action={
            <Button
              size="sm"
              startIcon={<SystemIcon name="eye-outline" size={14} />}
              variant="stroke"
              onClick={confirmDialog.open}
            >
              Xem nội dung (được ghi nhật ký)
            </Button>
          }
          description="Nội dung chỉ được mở khi cần xử lý báo cáo. Mỗi lần xem đều được ghi vào nhật ký quản trị."
          icon="lock-bold"
          intent="info"
          title="Nội dung thuộc phạm vi riêng tư"
        />
        <ConfirmDialog
          actionLabel="Xác nhận và xem"
          description="Hành động này được ghi vào nhật ký quản trị. Chủ nhóm hoặc những người trong cuộc trò chuyện sẽ được thông báo rằng đội kiểm duyệt đã xem nội dung bị báo cáo."
          open={confirmDialog.isOpen}
          recommendation="Chỉ xem khi cần để xử lý báo cáo — hệ thống hiển thị tin bị báo cáo và vài tin ngữ cảnh xung quanh."
          title="Xem nội dung riêng tư?"
          variant="warning"
          onConfirm={handleConfirm}
          onOpenChange={(next) => !next && confirmDialog.close()}
        />
      </>
    );
  }

  if (!error && (isLoading || !data)) {
    return (
      <div aria-label="Đang tải nội dung" className="flex flex-col gap-2" role="status">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error || !data) {
    const info = describeError(error);
    return (
      <Callout
        action={
          info.retry ? (
            <Button size="sm" variant="stroke" onClick={handleRetry}>
              Xem lại
            </Button>
          ) : undefined
        }
        description={info.description}
        intent={errorCodeOf(error) === MOD_ACCESS_EXPIRED ? 'warning' : 'error'}
        title={info.title}
      />
    );
  }

  const { messages, scope, viewedAt, accessExpiresAt } = data.data;
  return (
    <div className="flex flex-col gap-2">
      <Callout
        description={
          <span>
            Đã ghi nhật ký lần xem lúc {formatDate(viewedAt, TIME_FORMAT)}
            {scope.name ? ` (${scope.name})` : ''}.{' '}
            {accessExpiresAt
              ? `Quyền xem hết hạn lúc ${formatDate(accessExpiresAt, TIME_FORMAT)}.`
              : 'Quyền xem còn hiệu lực trong khi báo cáo đang mở; sau khi xử lý xong sẽ hết hạn.'}
          </span>
        }
        icon="eye-bold"
        intent="info"
        variant="ghost"
      />
      <ModerationMessageList canRemove={canRemove} messages={messages} onRemove={onRemove} />
    </div>
  );
});

export default PrivateContentGate;
