import { Redirect, router } from 'expo-router';

import { appConfig } from '@/core/config/env.config';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraph } from '@/shared/ui/skeleton';
import { PATHS } from '@/shell/config/constants';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useResolveMeetingCode } from '../queries/meetings.queries';
import { classifyMeetingError } from '../utils/meeting-errors';

export interface MeetingCodeLinkScreenProps {
  /** Mã họp ĐÃ chuẩn hoá (`abc-defg-hij`, xem `normalizeMeetingCode`). */
  code: string;
}

/**
 * Đích của link chia sẻ họp `https://<miền>/m/<mã>` (route `app/m/[id].tsx` phân loại theo HÌNH DẠNG mã): giải mã → mở chi tiết
 * cuộc họp. Route này nằm NGOÀI nhóm `(app)` nên không có hàng rào đăng nhập của `(app)/_layout.tsx` — chưa đăng nhập thì về màn
 * đăng nhập TRƯỚC khi gọi API (không thì `resolve` trả 401 và người dùng thấy toast "phiên hết hạn" thay vì màn đăng nhập).
 *
 * `allowed: false` (mã sai/cuộc họp bị huỷ, xoá, hoặc không đủ quyền) chỉ có lý do TRUNG TÍNH — cố ý không phân biệt để khỏi lộ mã
 * nào tồn tại (BE chống dò mã). Lỗi mạng/máy chủ thì có "Thử lại"; 404/403 cũng là "không còn khả dụng", không bắt thử lại vô ích.
 */
export function MeetingCodeLinkScreen({ code }: MeetingCodeLinkScreenProps) {
  const status = useAuthStore((state) => state.status);
  const authenticated = !appConfig.authEnabled || status === 'authenticated';
  const resolve = useResolveMeetingCode(authenticated ? code : undefined);

  if (!authenticated) return <Redirect href={PATHS.LOGIN} />;

  const result = resolve.data;
  if (result?.allowed && result.meetingId) {
    return <Redirect href={{ pathname: '/meetings/[meetingId]', params: { meetingId: result.meetingId } }} />;
  }

  const failure = resolve.isError ? classifyMeetingError(resolve.error) : null;
  const unavailable = result?.allowed === false || failure?.kind === 'NOT_FOUND' || failure?.kind === 'FORBIDDEN';

  return (
    <Screen header={<AppBar title="Mở cuộc họp" onBack={router.canGoBack() ? router.back : undefined} />}>
      {unavailable ? (
        <EmptyState
          actions={[{ label: 'Về lịch họp', onPress: () => router.replace(PATHS.MEETINGS) }]}
          description="Mã họp không đúng, cuộc họp đã bị huỷ, bị xoá hoặc bạn không có quyền xem."
          icon="calendar"
          title="Cuộc họp không còn khả dụng"
          tone="neutral"
        />
      ) : failure ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void resolve.refetch() }]}
          description={failure.message}
          icon="alert-warning"
          size="compact"
          title="Không mở được cuộc họp"
          tone="danger"
        />
      ) : (
        <SkeletonParagraph />
      )}
    </Screen>
  );
}
