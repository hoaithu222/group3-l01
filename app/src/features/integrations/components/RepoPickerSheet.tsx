import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { SearchInput, useSearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { WatchedResource } from '../api/integrations.types';
import { useIntegrationResources } from '../queries/integrations.queries';

/** Trần repo mỗi kết nối — khớp BE `LIMITS.integration.reposPerIntegrationMax`. */
export const REPOS_MAX = 20;

export interface RepoPickerSheetProps {
  integrationId: string;
  visible: boolean;
  selected: WatchedResource[];
  onClose: () => void;
  onDone: (next: WatchedResource[]) => void;
}

/**
 * Tấm chọn repo/project theo dõi (app.md §2 `GithubRepoPicker`): tìm IME-safe (ô uncontrolled + nhịp chờ — `useSearchInput`), chọn tối đa 20.
 * Danh sách lấy từ nhà cung cấp qua BE (`GET /integrations/:id/resources`) — app không bao giờ gọi GitHub trực tiếp.
 *
 * ✅ Trạng thái theo khuôn chung: tải lần đầu là khung xương (không phải vòng quay "tải thêm"), lỗi/rỗng là `EmptyState` gọn (lỗi có
 * "Thử lại") thay cho dòng chữ trơn; câu "đã chọn tối đa" là `hint` ngay trên nút "Xong".
 */
export function RepoPickerSheet({
  integrationId,
  visible,
  selected,
  onClose,
  onDone,
}: RepoPickerSheetProps) {
  const search = useSearchInput();
  const [draft, setDraft] = useState<WatchedResource[]>(selected);
  const { data, isError, isLoading, refetch } = useIntegrationResources(
    integrationId,
    search.value.trim(),
    visible,
  );
  const chosen = new Set(draft.map((r) => r.id));
  const full = draft.length >= REPOS_MAX;

  function toggle(r: WatchedResource, next: boolean): void {
    setDraft((prev) => (next ? [...prev, r] : prev.filter((p) => p.id !== r.id)));
  }

  let body;
  if (isLoading) {
    body = (
      <View>
        <SkeletonParagraphWithIcon className="py-xs" />
        <SkeletonParagraphWithIcon className="py-xs" />
        <SkeletonParagraphWithIcon className="py-xs" />
      </View>
    );
  } else if (isError) {
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
        description="Không tải được danh sách từ nhà cung cấp."
        icon="alert-warning"
        size="compact"
        tone="danger"
      />
    );
  } else if (data && data.items.length === 0) {
    body = (
      <EmptyState
        description="Không có repo nào khớp."
        icon="search"
        size="compact"
        tone="neutral"
      />
    );
  } else {
    body = (
      <View>
        {(data?.items ?? []).map((r) => (
          // Mỗi hàng cao tối thiểu 44 (cùng khuôn `AddCollaboratorSheet`): ô tích 24 xếp sát nhau thì vùng chạm hai hàng chồng lên nhau.
          <View key={r.id} className="min-h-[44px] justify-center">
            <Checkbox
              checked={chosen.has(r.id)}
              disabled={!chosen.has(r.id) && full}
              label={r.fullName}
              onChange={(next) => toggle(r, next)}
            />
          </View>
        ))}
      </View>
    );
  }

  return (
    <BottomSheet
      footer={
        <SheetActions
          hint={full ? `Đã chọn tối đa ${REPOS_MAX} repo.` : undefined}
          primary={{ label: `Xong (${draft.length}/${REPOS_MAX})`, onPress: () => onDone(draft) }}
        />
      }
      scrollable
      search={<SearchInput {...search.inputProps} placeholder="Tìm repo theo tên" />}
      title="Chọn repo theo dõi"
      visible={visible}
      onClose={onClose}
    >
      {body}
    </BottomSheet>
  );
}
