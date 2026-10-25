import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { BlockedCompany } from '../../api/recruiter.types';
import { BlockedCompanyRow } from '../../components/jobs/BlockedCompanyRow';
import { useUnblockCompany } from '../../queries/offers.mutations';
import { useCompanyBlocks } from '../../queries/offers.queries';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';

/**
 * Doanh nghiệp đã chặn (app.md §3): danh sách + "Bỏ chặn" có hộp thoại xác nhận nói rõ hậu quả. ⚠️ Bỏ chặn KHÔNG mở lại cuộc trao đổi cũ (BE giữ thread khoá) — hộp thoại
 * nói thẳng để không ai kỳ vọng ngược lại. Offline ⇒ khoá nút bỏ chặn. 404 (`CFG_005`: bảng tin tắt) ⇒ "Chưa khả dụng", không phải lỗi mạng.
 */
export function BlockedCompaniesScreen() {
  const blocks = useCompanyBlocks();
  const unblock = useUnblockCompany();
  const offline = useConnectionState() === 'offline';
  const [target, setTarget] = useState<BlockedCompany | null>(null);
  const header = <AppBar title="Doanh nghiệp đã chặn" onBack={router.back} />;

  if (blocks.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-16 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!blocks.data) {
    const gone = isOfferGone(blocks.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: () => void blocks.refetch() }]}
          description={
            gone ? 'Bảng tin nhà tuyển dụng đang tạm tắt.' : recruiterErrorMessage(blocks.error)
          }
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Chưa khả dụng' : 'Không tải được danh sách'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  const close = () => setTarget(null);
  const confirm = () => {
    if (!target) return;
    unblock.mutate(target.company.id, {
      onError: (error) => showToast('error', recruiterErrorMessage(error)),
      onSettled: close,
      onSuccess: () => showToast('success', 'Đã bỏ chặn doanh nghiệp'),
    });
  };

  return (
    <Screen
      header={header}
      refreshing={blocks.isRefetching}
      onRefresh={() => void blocks.refetch()}
    >
      {blocks.data.length === 0 ? (
        <EmptyState
          description="Doanh nghiệp bạn chặn sẽ không tìm thấy hồ sơ và không gửi được lời mời cho bạn."
          icon="shield-user"
          title="Bạn chưa chặn doanh nghiệp nào"
          tone="neutral"
        />
      ) : (
        <View className="py-xs">
          {blocks.data.map((blocked) => (
            <BlockedCompanyRow
              key={blocked.company.id}
              blocked={blocked}
              disabled={offline}
              onUnblock={setTarget}
            />
          ))}
        </View>
      )}
      <Dialog
        description="Doanh nghiệp có thể tìm thấy hồ sơ và gửi lời mời mới nếu bạn đang bật Tìm việc. Cuộc trao đổi đã đóng trước đó không mở lại."
        primaryAction={{ label: 'Bỏ chặn', loading: unblock.isPending, onPress: confirm }}
        secondaryAction={{ label: 'Huỷ', onPress: close }}
        title={`Bỏ chặn ${target?.company.name ?? 'doanh nghiệp'}?`}
        variant="warning"
        visible={target !== null}
        onClose={close}
      />
    </Screen>
  );
}
