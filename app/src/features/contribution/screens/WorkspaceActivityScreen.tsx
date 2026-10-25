import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { FeatureOffScreen } from '@/shell/capabilities';

import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { HeatmapDaySheet } from '../components/HeatmapDaySheet';
import { HeatmapPersonPicker } from '../components/HeatmapPersonPicker';
import { useWorkspaceActivityScreen } from '../hooks/useWorkspaceActivityScreen';
import { contributionErrorMessage, isAccessLost } from '../utils/contribution-errors';

/**
 * Màn "Hoạt động của nhóm" (p4-06, `GET /workspaces/:id/activity-heatmap`): cùng biểu đồ theo NGÀY với báo cáo đóng góp của bảng nhưng GỘP MỌI BẢNG của nhóm —
 * chọn "Cả nhóm" hoặc một thành viên, lưới 26 tuần (máy tính bảng 52), chạm ô xem chi tiết ngày, "Xem danh sách theo ngày" là bản chữ của lưới. Mọi thành viên của
 * nhóm xem được (khách/người ngoài bị BE chặn 404); chỉ ĐỌC, chỉ ngày + số đếm — không giờ, không id thẻ.
 *
 * Trạng thái: khung xương lúc tải (múi giờ nhóm rồi tới biểu đồ) · rỗng "Chưa có hoạt động" · lỗi + "Thử lại" trong khối (`ActivityHeatmap`) · mất quyền/nhóm không còn
 * (403/404) thì báo thẳng, không có nút "Thử lại" (thử lại vẫn thế) · offline chỉ đọc bản đã tải. Kéo xuống để làm mới.
 */
export function WorkspaceActivityScreen() {
  const view = useWorkspaceActivityScreen();
  const [listOpen, setListOpen] = useState(false);
  const { heatmap } = view;

  if (view.featureOff) return <FeatureOffScreen />;

  const header = <AppBar title="Hoạt động của nhóm" onBack={router.back} />;

  // Chỉ ở phạm vi "Cả nhóm": lọc theo một thành viên mà 404 là người đó không còn trong nhóm — lỗi nằm trong khối biểu đồ (còn chip để đổi phạm vi).
  if (view.heat === 'all' && heatmap.isError && !heatmap.data && isAccessLost(heatmap.error)) {
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          description={contributionErrorMessage(heatmap.error)}
          icon="lock"
          title="Không xem được hoạt động của nhóm"
          tone="warning"
        />
      </Screen>
    );
  }

  return (
    <Screen
      constrained={!view.tablet}
      header={header}
      refreshing={heatmap.isRefetching}
      onRefresh={view.refresh}
    >
      <View className="gap-md py-xs">
        {view.offline ? (
          <Alert description="Đang ngoại tuyến — biểu đồ là dữ liệu đã tải gần nhất." tone="warning" />
        ) : null}
        <Text className="text-body-md text-fg-2">
          Gộp hoạt động của mọi bảng trong nhóm: thẻ, việc nhỏ, bình luận và lượt chấm theo từng ngày. Chỉ hiện ngày và số lượng, không có giờ.
        </Text>
        <Section icon="calendar" title="Hoạt động">
          <View className="gap-sm">
            <HeatmapPersonPicker allLabel="Cả nhóm" options={view.options} value={view.heat} onChange={view.setHeat} />
            <ActivityHeatmap
              data={heatmap.data}
              error={heatmap.error}
              loading={heatmap.isLoading}
              range={view.range}
              weeks={view.weeks}
              onOpenList={() => setListOpen(true)}
              onRetry={() => void heatmap.refetch()}
            />
          </View>
        </Section>
      </View>
      <HeatmapDaySheet days={heatmap.data?.days ?? []} visible={listOpen} onClose={() => setListOpen(false)} />
    </Screen>
  );
}
