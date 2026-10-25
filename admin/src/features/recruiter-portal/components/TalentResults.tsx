import { memo } from 'react';
import type { ReactNode } from 'react';

import { Button, Callout, EmptyState, Skeleton } from '@/shared/ui';

import type { TalentCard } from '../types/talent.types';
import TalentCardItem from './TalentCardItem';

export interface TalentResultsProps {
  talents: readonly TalentCard[];
  /** Lần tải ĐẦU (chưa có gì để hiện). */
  loading: boolean;
  /** Lỗi tải mà chưa có dữ liệu. */
  error: { retry: () => void; title: string; description: string } | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  matchedCodes: readonly string[];
  hrefFor: (userId: string) => string;
  onOpen: (userId: string) => void;
}

const EMPTY_TEXT = 'Không có ứng viên khớp bộ lọc. Thử bớt kỹ năng hoặc giảm đóng góp tối thiểu.';

/**
 * Lưới kết quả tìm ứng viên (admin.md p6-08 §2.4): thẻ + "Tải thêm" (cursor, ≤ 50/trang). Đủ ba trạng thái KHÔNG gộp: đang tải (khung xương) · lỗi (Callout + "Thử lại",
 * KHÔNG vẽ "không có ứng viên" khi BE hỏng) · rỗng thật (gợi ý nới bộ lọc). Lỗi khi ĐÃ có dữ liệu (tải thêm hỏng) giữ nguyên các thẻ đang có.
 */
const TalentResults = memo(function TalentResults(p: TalentResultsProps) {
  let body: ReactNode;
  if (p.error && p.talents.length === 0) {
    body = (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={p.error.retry}>
            Thử lại
          </Button>
        }
        description={p.error.description}
        intent="error"
        title={p.error.title}
      />
    );
  } else if (p.loading) {
    body = (
      <div aria-label="Đang tải ứng viên" className="grid grid-cols-1 gap-3 xl:grid-cols-2" role="status">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    );
  } else if (p.talents.length === 0) {
    body = <EmptyState icon="user-2-bold" size="sm" title={EMPTY_TEXT} />;
  } else {
    body = (
      <>
        <ul aria-label="Kết quả ứng viên" className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {p.talents.map((t) => (
            <li key={t.userId} className="min-w-0">
              <TalentCardItem
                href={p.hrefFor(t.userId)}
                matchedCodes={p.matchedCodes}
                talent={t}
                onOpen={p.onOpen}
              />
            </li>
          ))}
        </ul>
        {p.hasMore ? (
          <div className="flex justify-center pt-1">
            <Button loading={p.loadingMore} size="sm" variant="stroke" onClick={p.onLoadMore}>
              Tải thêm
            </Button>
          </div>
        ) : null}
      </>
    );
  }
  return <div className="flex flex-col gap-3">{body}</div>;
});

export default TalentResults;
