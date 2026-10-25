import { View } from 'react-native';

import { EmptyState, type EmptyStateActionProps } from '@/shared/ui/empty-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { RateLimitNotice, type SearchTextIssue } from '@/shared/search';

import type { WorkspaceSearchType } from '../api';
import { SEARCH_TYPE_NOUN, WORKSPACE_SEARCH_HINT } from '../constants/workspace-search.constants';
import type { SearchStatus } from '../hooks/useWorkspaceSearchScreen';
import { OFFLINE_MESSAGE, type WorkspaceSearchError } from '../utils/search-error';
import { supportsFilters } from '../utils/search-params';

export interface SearchStateViewProps {
  /** Đã chọn khoảng ngày — chưa chọn thì BE chỉ tìm `lookbackMonths` tháng gần nhất (tin/tệp) và màn phải nói rõ điều đó. */
  dateRangeSet: boolean;
  /** Có bộ lọc đang bật — "không có kết quả" thường do lọc, nên gợi ý "Xoá bộ lọc" trước. */
  hasFilters: boolean;
  error: WorkspaceSearchError | null;
  /** Đổi mỗi lần lỗi mới — `key` để bộ đếm 429 dựng lại với số giây mới. */
  errorStamp: number;
  issue: SearchTextIssue | null;
  /** Khoảng lùi mặc định của BE (tháng) — `useSearchLookbackMonths`. */
  lookbackMonths: number;
  /** Mọi trạng thái NGOÀI `results`/`disabled`/gợi ý tìm gần đây — danh sách kết quả do màn tự vẽ. */
  status: Exclude<SearchStatus, 'disabled' | 'results'>;
  tab: WorkspaceSearchType;
  onClearFilters: () => void;
  /** `SRCH_102`: phạm vi đang lọc không còn đọc được → bỏ riêng bộ lọc phạm vi. */
  onClearScope: () => void;
  onOpenFilters: () => void;
  onRetry: () => void;
}

/** Khung xương CÙNG HÌNH một hàng kết quả (ô ảnh/icon tròn + hai dòng chữ), cùng lề `px-md py-sm` của hàng thật. */
function LoadingRows() {
  return (
    <View accessibilityLabel="Đang tìm" accessibilityRole="progressbar">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
      ))}
    </View>
  );
}

/**
 * Các trạng thái KHÔNG có danh sách kết quả của màn tìm toàn nhóm (app.md p5-04 §3): gợi ý nhập · đang tải (skeleton 5
 * dòng) · "Cần kết nối để tìm" khi mất mạng · lỗi TẠI CHỖ (`SRCH_*`, 429 đếm ngược) · không có kết quả. Nút hành động theo
 * đúng nguyên nhân: quá rộng → "Thêm bộ lọc"; phạm vi mất → "Bỏ lọc phạm vi"; lọc mà rỗng → "Xoá bộ lọc".
 */
export function SearchStateView({
  dateRangeSet,
  error,
  errorStamp,
  hasFilters,
  issue,
  lookbackMonths,
  status,
  tab,
  onClearFilters,
  onClearScope,
  onOpenFilters,
  onRetry,
}: SearchStateViewProps) {
  if (status === 'hint') {
    return (
      <EmptyState
        description={WORKSPACE_SEARCH_HINT[issue ?? 'empty']}
        icon="search"
        size="compact"
        tone="info"
      />
    );
  }
  if (status === 'loading') return <LoadingRows />;

  if (status === 'offline') {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description="Kiểm tra kết nối mạng rồi thử lại."
        icon="unlink"
        title={OFFLINE_MESSAGE}
        tone="neutral"
      />
    );
  }

  if (status === 'error' && error?.kind === 'rate-limited') {
    return (
      <RateLimitNotice key={errorStamp} seconds={error.retryAfterSeconds ?? 10} onRetry={onRetry} />
    );
  }

  if (status === 'error') {
    const actions: EmptyStateActionProps[] = [];
    let description = error?.message ?? 'Không tìm được, vui lòng thử lại.';
    let title = 'Không tìm được';

    if (error?.kind === 'too-broad') {
      title = error.message;
      description = 'Chọn khoảng ngày, người gửi hoặc một kênh để thu hẹp phạm vi tìm.';
      if (supportsFilters(tab)) actions.push({ label: 'Thêm bộ lọc', onPress: onOpenFilters });
    } else if (error?.kind === 'scope-gone') {
      title = error.message;
      description = 'Kênh hoặc nhóm chat đang lọc không còn đọc được.';
      actions.push({ label: 'Bỏ lọc phạm vi', onPress: onClearScope });
    } else if (error?.kind === 'forbidden') {
      title = error.message;
      description = 'Khách chỉ tìm được tin nhắn, tệp, kênh và cuộc họp.';
    } else {
      actions.push({ label: 'Thử lại', onPress: onRetry });
    }
    return (
      <EmptyState
        actions={actions}
        description={description}
        icon={error?.kind === 'forbidden' ? 'lock' : 'alert-warning'}
        title={title}
        tone={error?.kind === 'forbidden' ? 'warning' : 'danger'}
      />
    );
  }

  // Tin/tệp mà chưa chọn khoảng ngày: BE chỉ tìm `lookbackMonths` tháng gần nhất — "không thấy" có thể chỉ vì tin cũ hơn.
  const olderHint = supportsFilters(tab) && !dateRangeSet;
  const emptyActions: EmptyStateActionProps[] = [];
  if (hasFilters) {
    emptyActions.push({ label: 'Xoá bộ lọc', onPress: onClearFilters, variant: 'secondary' });
  }
  if (olderHint) emptyActions.push({ label: 'Chọn khoảng ngày', onPress: onOpenFilters });

  return (
    <EmptyState
      actions={emptyActions.length > 0 ? emptyActions : undefined}
      description={
        olderHint
          ? `Khi chưa chọn khoảng ngày, chỉ tìm trong ${lookbackMonths} tháng gần nhất. Thử bỏ dấu, đổi từ khoá hoặc chọn khoảng ngày.`
          : 'Thử bỏ dấu, đổi từ khoá hoặc bỏ bộ lọc.'
      }
      icon="search"
      title={`Không tìm thấy ${SEARCH_TYPE_NOUN[tab]}`}
      tone="neutral"
    />
  );
}
