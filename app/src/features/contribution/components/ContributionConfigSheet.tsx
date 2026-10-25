import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import { useContributionConfig } from '../queries/report.queries';
import { contributionKeys } from '../queries/contribution.keys';
import { contributionErrorMessage } from '../utils/contribution-errors';
import {
  ContributionConfigForm,
  type ContributionConfigFormHandle,
} from './ContributionConfigForm';

export interface ContributionConfigSheetProps {
  boardId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm "Đổi trọng số" — chỉ OWNER/ADMIN thấy nút mở (`FormulaCard`), server vẫn kiểm lại quyền ở `PUT`. Công thức + `version` (CAS) tải khi tấm mở.
 * Đóng tấm thì XOÁ bản đã tải: lần mở sau tải lại từ đầu, để `expectedVersion` không dựa trên bản cũ (người khác có thể đã đổi giữa hai lần mở).
 * Form chỉ dựng sau khi có dữ liệu — và KHÔNG dựng lại khi "Tải lại" sau `RES_003`, nên giá trị đang gõ được giữ.
 *
 * ✅ [Huỷ | Lưu] ở `footer` (`SheetActions`, chỉ hiện khi form đã dựng) — nút gọi `submit` của form qua `ref`. Đang lưu thì "Huỷ" và nền
 * mờ bị khoá. Tải lỗi là `EmptyState` gọn có "Thử lại" (cùng khuôn trạng thái lỗi của mọi tấm khác).
 */
export function ContributionConfigSheet({
  boardId,
  visible,
  onClose,
}: ContributionConfigSheetProps) {
  const queryClient = useQueryClient();
  const config = useContributionConfig(boardId, visible);
  const form = useRef<ContributionConfigFormHandle>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    queryClient.removeQueries({ queryKey: contributionKeys.config(boardId) });
    onClose();
  };

  return (
    <BottomSheet
      dismissOnBackdrop={!saving}
      footer={
        config.data ? (
          <SheetActions
            primary={{ label: 'Lưu', loading: saving, onPress: () => form.current?.submit() }}
            secondary={{ disabled: saving, label: 'Huỷ', onPress: close }}
          />
        ) : undefined
      }
      scrollable
      title="Đổi trọng số"
      visible={visible}
      onClose={close}
    >
      {config.data ? (
        <ContributionConfigForm
          ref={form}
          boardId={boardId}
          config={config.data}
          reload={async () => (await config.refetch()).data}
          onPendingChange={setSaving}
          onSaved={close}
        />
      ) : config.isError ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void config.refetch() }]}
          description={contributionErrorMessage(config.error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được công thức"
          tone="danger"
        />
      ) : (
        // Khung xương cùng hình các ô nhập của form (cao 48) — không có `footer` lúc này nên giữ khe `pb-md` dưới cùng.
        <View className="gap-sm pb-md">
          <Skeleton className="h-12 rounded-xs" />
          <Skeleton className="h-12 rounded-xs" />
          <Skeleton className="h-12 rounded-xs" />
        </View>
      )}
    </BottomSheet>
  );
}
