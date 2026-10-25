import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { SearchStatus } from '../hooks/useScopeSearchScreen';
import type { DiscoveryErrorInfo } from '../utils/error-info';
import { SEARCH_ISSUE_HINT, type SearchTextIssue } from '../utils/search-query';
import { RateLimitNotice } from './RateLimitNotice';

export interface SearchStateViewProps {
  error: DiscoveryErrorInfo | null;
  errorStamp: number;
  hasFilters: boolean;
  issue: SearchTextIssue | null;
  /** Mọi trạng thái NGOÀI `results` — danh sách kết quả do màn tự vẽ. */
  status: Exclude<SearchStatus, 'results'>;
  onClearFilters: () => void;
  onRetry: () => void;
}

/**
 * Bốn trạng thái không có kết quả của màn tìm (app.md p1-09 §3): gợi ý nhập / đang tải (skeleton 5 dòng) / lỗi tại chỗ
 * (`SRCH_*`, mạng, 429 đếm ngược) / không có kết quả (kèm "Xoá bộ lọc" khi đang lọc — nguyên nhân thường gặp nhất của "rỗng").
 */
export function SearchStateView({
  error,
  errorStamp,
  hasFilters,
  issue,
  status,
  onClearFilters,
  onRetry,
}: SearchStateViewProps) {
  if (status === 'hint') {
    return (
      <EmptyState
        description={SEARCH_ISSUE_HINT[issue ?? 'empty']}
        icon="search"
        title={issue && issue !== 'empty' ? undefined : 'Tìm trong cuộc trò chuyện'}
        // `info`: lời gợi ý, chưa phải "không có kết quả" (cùng tông gợi ý của màn tìm toàn nhóm).
        tone="info"
      />
    );
  }

  if (status === 'loading') {
    // Khung xương CÙNG HÌNH hàng kết quả (avatar + hai dòng chữ), cùng lề `px-md py-sm` của `SearchHitRow`.
    return (
      <View accessibilityLabel="Đang tìm" accessibilityRole="progressbar">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonParagraphWithIcon key={index} className="px-md py-sm" />
        ))}
      </View>
    );
  }

  if (status === 'error' && error?.kind === 'rate-limited') {
    return (
      <RateLimitNotice key={errorStamp} seconds={error.retryAfterSeconds ?? 10} onRetry={onRetry} />
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description={error?.message ?? 'Không tìm được, vui lòng thử lại.'}
        icon="alert-warning"
        title="Không tìm được"
        tone="danger"
      />
    );
  }

  // "Xoá bộ lọc" là hành động CỦA khối rỗng (khe `actions`), không phải nút rời đặt dưới — cùng khuôn nút mọi màn rỗng.
  return (
    <EmptyState
      actions={
        hasFilters
          ? [{ label: 'Xoá bộ lọc', onPress: onClearFilters, variant: 'secondary' }]
          : undefined
      }
      description={hasFilters ? 'Thử bỏ bớt bộ lọc hoặc đổi từ khoá.' : 'Thử từ khoá khác.'}
      icon="search"
      title="Không tìm thấy tin phù hợp"
      tone="neutral"
    />
  );
}
