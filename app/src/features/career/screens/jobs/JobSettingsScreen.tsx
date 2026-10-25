import { router } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { JobSettingsContent } from '../../components/jobs/JobSettingsContent';
import { useJobSettings } from '../../queries/offers.queries';
import { isOfferGone, recruiterErrorMessage } from '../../utils/recruiter-errors';

/**
 * Tìm việc (app.md §3): Open to work + hồ sơ + xem trước + đồng ý chính sách. Cờ `career` tắt ⇒ 404 ⇒ "Chưa khả dụng" (không phải lỗi mạng, không thử lại).
 * Dữ liệu server đổi (lưu xong, máy khác đổi) ⇒ `key` dựng lại phần form với giá trị mới — form RHF không tự đọc lại `defaultValues`. Offline: đọc cache, khoá lưu.
 */
export function JobSettingsScreen() {
  const query = useJobSettings();
  const settings = query.data;
  const header = <AppBar title="Tìm việc" onBack={router.back} />;

  if (query.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-56 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!settings) {
    const gone = isOfferGone(query.error);
    return (
      <Screen header={header}>
        <EmptyState
          actions={gone ? undefined : [{ label: 'Thử lại', onPress: () => void query.refetch() }]}
          description={gone ? 'Tính năng này đang tạm tắt.' : recruiterErrorMessage(query.error)}
          icon={gone ? 'lock' : 'alert-warning'}
          title={gone ? 'Chưa khả dụng' : 'Không tải được cài đặt Tìm việc'}
          tone={gone ? 'warning' : 'danger'}
        />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      keyboardAware
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <JobSettingsContent
        key={JSON.stringify([settings.headline, settings.location, settings.preferredRoles])}
        settings={settings}
      />
    </Screen>
  );
}
