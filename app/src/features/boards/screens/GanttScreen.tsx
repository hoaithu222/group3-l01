import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { FeatureOffScreen } from '@/shell/capabilities';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/style/cn';

import type { GanttTaskDto } from '../api/critical-path.types';
import { GanttChart } from '../components/gantt/GanttChart';
import { GanttDateSheetHost } from '../components/gantt/GanttDateSheetHost';
import { GanttLegend } from '../components/gantt/GanttLegend';
import { GanttToolbar } from '../components/gantt/GanttToolbar';
import { MilestoneList } from '../components/gantt/MilestoneList';
import { RescheduleBanner } from '../components/kanban/RescheduleBanner';
import { RescheduleWarningSheet } from '../components/task/RescheduleWarningSheet';
import { useGanttBoard } from '../hooks/useGanttBoard';
import { useGanttMove } from '../hooks/useGanttMove';
import { differsFromDevice } from '../utils/zoned-date';

/** Thanh giả của khung xương — bề rộng + lề trái khác nhau cho giống các thẻ rải trên trục ngày (chuỗi TĨNH để NativeWind sinh class). */
const SKELETON_BARS = [
  'ml-0 w-1/2',
  'ml-8 w-2/5',
  'ml-16 w-1/3',
  'ml-4 w-1/2',
  'ml-24 w-1/4',
  'ml-12 w-2/5',
] as const;

/**
 * Màn "Dòng thời gian" (Gantt, app.md §3): TABLET vẽ biểu đồ (thanh theo ngày, mũi tên phụ thuộc, đường găng, xung đột,
 * kéo để dời lịch); ĐIỆN THOẠI hiện danh sách mốc theo tuần, không SVG, không kéo. Cả hai dùng chung dữ liệu
 * `GET /boards/:id/gantt`. Chạm một thanh mở tấm ngày của thẻ (đường thay thế cho kéo); không có quyền/offline thì chạm
 * mở chi tiết thẻ.
 *
 * Trạng thái: khung chờ (trục + 6 hàng) · rỗng "Chưa có thẻ nào có ngày" · lỗi + Thử lại · `truncated` ("Chỉ hiện 2.000
 * thẻ đầu") · offline chỉ đọc · banner lô dời nền. Mất quyền/bảng bị xoá do `BoardScopeProvider` đưa ra hub nhóm.
 */
export function GanttScreen() {
  const { boardId, wsId } = useLocalSearchParams<{ boardId: string; wsId: string }>();
  const view = useGanttBoard(wsId, boardId);
  const move = useGanttMove(boardId);
  const [editing, setEditing] = useState<string | null>(null);

  const openTask = (taskId: string) =>
    router.push({
      params: { boardId, taskId, wsId },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  // Chạm thanh: có quyền → tấm ngày (đường thay thế cho kéo); chỉ-đọc → xem chi tiết.
  const onBar = (task: GanttTaskDto) => (view.canMove && task.dueDate ? setEditing(task.id) : openTask(task.id));

  const header = <AppBar subtitle={view.board.data?.name} title="Dòng thời gian" onBack={router.back} />;
  if (view.featureOff) return <FeatureOffScreen />;

  const { data, error, isError, refetch } = view.gantt;
  const hasNotices = Boolean(
    view.archived ||
      view.offline ||
      data?.truncated ||
      (data && differsFromDevice(data.timezone)) ||
      view.activeBatchId,
  );
  let body: ReactNode;
  if (!data && isError) {
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
        description={toErrorMessage(error)}
        icon="alert-warning"
        title="Không tải được dòng thời gian"
        tone="danger"
      />
    );
  } else if (!data) {
    // Khung xương có dáng DÒNG THỜI GIAN: trục ngày + các thanh lệch nhau (thay cho bảy khối bằng nhau) + nhãn "Đang tải…".
    body = (
      <ScreenState
        skeleton={
          <View className="gap-xs px-md pt-xs">
            <Skeleton className="h-10 rounded-xs" />
            {SKELETON_BARS.map((bar) => (
              <Skeleton key={bar} className={cn('h-8 rounded-full', bar)} />
            ))}
          </View>
        }
        state="loading"
      />
    );
  } else if (data.tasks.length === 0) {
    body = (
      <EmptyState
        description="Đặt ngày bắt đầu hoặc hạn chót cho thẻ để chúng hiện trên dòng thời gian."
        icon="calendar"
        title="Chưa có thẻ nào có ngày"
        tone="success"
      />
    );
  } else if (view.showChart) {
    body = (
      <>
        <GanttLegend canDrag={view.canMove} />
        <GanttChart
          canDrag={view.canMove}
          columnOrder={view.columnOrder}
          data={data}
          rangeKey={view.rangeKey}
          onOpenBar={onBar}
          onShift={move.shift}
        />
      </>
    );
  } else {
    body = <MilestoneList boardId={boardId} data={data} onOpenTask={openTask} />;
  }

  return (
    <Screen constrained={false} contentClassName="flex-1" header={header} padded={false} scrollable={false}>
      <GanttToolbar
        chartShown={view.showChart}
        rangeKey={view.rangeKey}
        tablet={view.tablet}
        onRange={view.selectRange}
        onToggleView={view.toggleListView}
      />
      {/* Chỉ dựng khung khi CÓ thông báo — khung rỗng vẫn để lại một dải đệm 8dp giữa thanh công cụ và biểu đồ/danh sách. */}
      {hasNotices ? (
        <View className="gap-xs px-md pb-xs">
          {view.archived ? <Alert description="Bảng đã lưu trữ — chỉ xem, không đổi lịch được." tone="warning" /> : null}
          {view.offline ? <Alert description="Không có kết nối — chỉ xem, không đổi lịch được." tone="info" /> : null}
          {data?.truncated ? (
            <Alert description="Chỉ hiện 2.000 thẻ đầu, hãy thu hẹp khoảng ngày." tone="warning" />
          ) : null}
          {data && differsFromDevice(data.timezone) ? (
            <Alert description={`Ngày theo múi giờ ${data.timezone}.`} icon={null} tone="info" />
          ) : null}
          {view.activeBatchId && !view.offline ? (
            <RescheduleBanner
              batchId={view.activeBatchId}
              boardId={boardId}
              onDismiss={view.dismissBatch}
              onOpenTask={openTask}
            />
          ) : null}
        </View>
      ) : null}

      <View className="flex-1">{body}</View>

      {editing ? (
        <GanttDateSheetHost boardId={boardId} taskId={editing} wsId={wsId} onClose={() => setEditing(null)} />
      ) : null}
      <RescheduleWarningSheet boardId={boardId} controller={move.reschedule} />
    </Screen>
  );
}
