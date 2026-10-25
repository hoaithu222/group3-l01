import { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { EmptyState } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import type { InsightsTopWorkspace } from '@/core/api/admin';

export interface TopWorkspacesPanelProps {
  /** Tối đa 5 dòng, đã GIẢM dần theo `messages` (BE sắp). */
  workspaces: readonly InsightsTopWorkspace[];
  /** Đường dẫn gốc module workspace (cha dựng từ registry — file này không import registry). Tên → `${base}/${id}`. */
  workspaceBasePath: string;
}

/**
 * Top workspace sôi động nhất kỳ: thứ hạng · tên (cắt "…") · số thành viên · thanh tin nhắn so với hạng 1 · số tin.
 *
 * Thanh đo theo workspace ĐỨNG ĐẦU (hạng 1 luôn đầy) chứ không theo 100 — câu hỏi ở đây là "nhất hơn nhì bao nhiêu"
 * (cùng lý do với kit2 `RankingBoard`, nhưng bảng đó không có liên kết tên + dòng phụ số thành viên nên dựng riêng).
 *
 * Tên là liên kết sang chi tiết workspace CHỈ khi có `workspace:view` — thiếu quyền mà vẫn là link thì bấm vào ra trang 403. Không có quyền → chữ thường.
 * Mỗi dòng `flex-1` (trần `max-h-14`) nên 5 dòng chia đều chiều cao panel, mép dưới thẳng hàng các panel cùng hàng; ít dòng hơn thì không bị kéo giãn lố.
 */
const TopWorkspacesPanel = memo(function TopWorkspacesPanel({
  workspaces,
  workspaceBasePath,
}: TopWorkspacesPanelProps) {
  const canView = useAuthStore((s) => s.hasPermission('workspace', 'view'));
  // Sàn 0 + chặn chia 0: bảng toàn 0 tin thì mọi thanh rỗng, không phải `NaN%` (chiều rộng `NaN%` bị trình duyệt bỏ qua — thanh biến mất không báo lỗi).
  const topMessages = useMemo(
    () => workspaces.reduce((max, w) => Math.max(max, w.messages), 0),
    [workspaces],
  );

  if (workspaces.length === 0) {
    return (
      <EmptyState
        description="Chưa có workspace nào hoạt động trong kỳ này."
        icon="chart-simple-bold"
        size="sm"
        title="Chưa có dữ liệu"
      />
    );
  }

  return (
    <ol className="flex h-full min-h-0 flex-col">
      {workspaces.map((w, index) => {
        const percent = topMessages > 0 ? Math.min(100, (w.messages / topMessages) * 100) : 0;
        return (
          <li
            key={w.id}
            className="flex max-h-14 min-h-0 flex-1 items-center gap-2 border-b border-border-1 last:border-b-0"
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center border border-border-1 bg-bg-2 text-caption-10-medium tabular-nums text-fg-3"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                {canView ? (
                  <Link
                    className="min-w-0 truncate text-caption-12-medium text-link hover:underline"
                    title={w.name}
                    to={`${workspaceBasePath}/${w.id}`}
                  >
                    {w.name}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-caption-12-medium text-fg-1" title={w.name}>
                    {w.name}
                  </span>
                )}
                <span className="shrink-0 text-caption-12-semibold tabular-nums text-fg-1">
                  {formatNumber(w.messages)} <span className="text-caption-12 text-fg-4">tin</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div aria-hidden className="h-1.5 min-w-0 flex-1 bg-divider-1">
                  <div className="h-full bg-secondary-5" style={{ width: `${percent}%` }} />
                </div>
                <span className="shrink-0 text-caption-12 tabular-nums text-fg-4">
                  {formatNumber(w.memberCount)} thành viên
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
});

export default TopWorkspacesPanel;
