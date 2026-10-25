import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { LinkButton } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import { SearchInput } from '@/shared/ui/search';
import { isNetworkError } from '@/shared/utils/errors';
import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { WorkspaceListItem } from '../api';
import {
  groupWorkspaces,
  summarizeWorkspaces,
  workspaceSummaryText,
  type WorkspaceListSectionKey,
} from '../utils/workspace-list-sections';
import { WorkspaceListHeader } from './WorkspaceListHeader';
import { WorkspaceListSection } from './WorkspaceListSection';

/** Icon mốc chỉ cho hai khối ĐẶC BIỆT — khối "Tất cả" để trơn (icon là mốc, không phải hoa văn — xem `Section.icon`). */
const SECTION_ICON: Partial<Record<WorkspaceListSectionKey, IconName>> = {
  favorites: 'star',
  pending: 'clock',
};

export interface WorkspaceListBodyProps {
  /** Danh sách ĐÃ vá số chưa đọc sống (`withWorkspaceUnread`) — luôn có ít nhất một mục (rỗng là việc của màn cha). */
  items: readonly WorkspaceListItem[];
  /** Lỗi của lần tải lại GẦN NHẤT trong khi vẫn còn bản cũ — `null`/`undefined` = không lỗi. */
  refreshError: unknown;
  onJoin: () => void;
  onOpen: (workspace: WorkspaceListItem) => void;
  onRetry: () => void;
  onScan: () => void;
}

/**
 * Phần thân của danh sách nhóm khi ĐÃ có nhóm: đầu danh sách (tóm tắt + lối vào phụ) · ô tìm · báo lỗi tải lại · các khối
 * "Đang chờ duyệt / Yêu thích / Tất cả nhóm" (`groupWorkspaces`). Đang tìm thì gộp thành MỘT khối "Kết quả" (lọc theo tên,
 * không dấu — `matchesSearch`): người đang gõ cần câu trả lời, không cần phân loại.
 *
 * ⛔ Lỗi tải lại KHÔNG thay thế danh sách: `networkMode: 'always'` (`query-client.ts`) làm lượt tải ngầm hỏng NGAY khi mất
 * sóng (`isError` bật trong khi `data` vẫn còn) — bản trước vẽ thẳng khối "Không tải được" và giấu mất danh sách người dùng
 * vừa thấy. Giờ giữ danh sách cũ, chỉ thêm một dòng `Alert` + "Thử lại" (app.md p1-01 §3: lỗi "tại chỗ", offline "hiện cache").
 * ⛔ Ô tìm và hàng nút KHÔNG bọc `Reveal`: thứ người dùng thao tác phải bấm được ngay.
 */
export function WorkspaceListBody({
  items,
  refreshError,
  onJoin,
  onOpen,
  onRetry,
  onScan,
}: WorkspaceListBodyProps) {
  const [query, setQuery] = useState('');
  const term = query.trim();
  const sections = useMemo(() => groupWorkspaces(items), [items]);
  const results = useMemo(
    () => (term ? items.filter((workspace) => matchesSearch(term, workspace.name)) : []),
    [items, term],
  );
  const summaryText = workspaceSummaryText(summarizeWorkspaces(items));

  return (
    <>
      <WorkspaceListHeader summaryText={summaryText} onJoin={onJoin} onScan={onScan} />
      <SearchInput placeholder="Tìm nhóm" onChangeText={setQuery} />

      {refreshError ? (
        <Alert
          actions={<LinkButton label="Thử lại" size="sm" onPress={onRetry} />}
          description={
            isNetworkError(refreshError)
              ? 'Mất kết nối — đang hiện danh sách đã lưu.'
              : 'Chưa tải lại được danh sách — đang hiện bản đã lưu.'
          }
          tone="warning"
        />
      ) : null}

      {term ? (
        results.length > 0 ? (
          <WorkspaceListSection items={results} title="Kết quả" onOpen={onOpen} />
        ) : (
          <EmptyState
            description="Không tìm thấy nhóm nào khớp."
            icon="search"
            size="compact"
            title="Không có kết quả"
            tone="neutral"
          />
        )
      ) : (
        // `gap-xl` (24) giữa hai khối có tiêu đề — nhịp khe khối của mọi màn (`screen-layout.md`).
        <View className="gap-xl">
          {sections.map((section, index) => (
            <WorkspaceListSection
              key={section.key}
              icon={SECTION_ICON[section.key]}
              items={section.items}
              revealOffset={sections
                .slice(0, index)
                .reduce((sum, previous) => sum + previous.items.length, 0)}
              title={section.title}
              onOpen={onOpen}
            />
          ))}
        </View>
      )}
    </>
  );
}
