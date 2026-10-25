import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { BoardCardActionsSlot, BoardListActionsSlot } from '@/shared/board-extensions';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton, SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import { BoardCard } from '../components/BoardCard';
import { useBoards } from '../queries/boards.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';
import { canCreateBoard } from '../utils/board-permissions';
import { boardHref } from '../utils/board-routes';
import { getHttpStatus } from '../utils/error-details';

const TABS = [
  { key: 'active', label: 'Đang dùng' },
  { key: 'archived', label: 'Đã lưu trữ' },
];

function openNewBoard(wsId: string): void {
  router.push({ params: { wsId }, pathname: '/workspaces/[wsId]/boards/new' });
}

function openBoard(wsId: string, boardId: string): void {
  router.push(boardHref(wsId, boardId));
}

/**
 * Danh sách bảng của nhóm (`app.md` §3 BoardList). Chỉ OWNER/ADMIN của nhóm
 * ĐANG hoạt động thấy nút "Tạo bảng" (README §6); người khác thấy lời nhắn nhờ
 * quản trị nhóm tạo. 404 ⇒ nhóm không còn với tôi ⇒ về hub nhóm.
 *
 * Mở đầu bằng `ModuleBanner` (icon `checkmark-square` tông `success` — cùng nhận diện với lối vào "Việc" ở hub nhóm); khung
 * xương có dáng thẻ bảng thật (ô icon + hai dòng + thanh tiến độ) thay cho ba khối xám trơn.
 */
export function BoardListScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const [tab, setTab] = useState('active');
  const archived = tab === 'archived';
  const boards = useBoards(wsId, archived);
  // Màn nằm DƯỚI Kanban (vẫn mounted) và không ở trong phòng socket của bảng — thẻ người khác đổi chỉ về khi quay lại.
  useRefetchOnFocus(boards);
  const access = useWorkspaceBoardAccess(wsId);

  const canCreate = canCreateBoard(access.data);

  if (getHttpStatus(boards.error) === 404) {
    return <Redirect href={{ params: { wsId }, pathname: '/workspaces/[wsId]' }} />;
  }

  const items = boards.data ?? [];

  return (
    <Screen
      header={
        <AppBar
          actions={
            canCreate ? (
              <Button
                accessibilityLabel="Tạo bảng"
                iconLeft="add"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => openNewBoard(wsId)}
              />
            ) : undefined
          }
          title="Việc"
          onBack={router.back}
        />
      }
      refreshing={boards.isRefetching}
      onRefresh={() => void boards.refetch()}
    >
      <View className="gap-xl py-xs">
        <Reveal>
          <ModuleBanner
            description="Theo dõi việc cần làm, tiến độ và hạn chót của cả nhóm"
            icon="checkmark-square"
            title="Bảng công việc của nhóm"
            tone="success"
          />
        </Reveal>
        {/* Lối vào cấp NHÓM của feature khác (p4-06 "Hoạt động của nhóm") đi qua khe chung — `boards` không import feature đó. */}
        <BoardListActionsSlot wsId={wsId} />
        <Tabs
          items={TABS}
          value={tab}
          onChange={(next) => {
            hapticSelection();
            setTab(next);
          }}
        />

        {boards.isLoading ? (
          <View className="gap-sm">
            {[0, 1, 2].map((index) => (
              <Card key={index}>
                <SkeletonParagraphWithIcon />
                <Skeleton className="h-2 rounded-full" />
              </Card>
            ))}
          </View>
        ) : boards.isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void boards.refetch() }]}
            description={toErrorMessage(boards.error)}
            icon="alert-warning"
            title="Không tải được danh sách bảng"
            tone="danger"
          />
        ) : items.length === 0 ? (
          <EmptyState
            actions={
              canCreate && !archived ? [{ label: 'Tạo bảng', onPress: () => openNewBoard(wsId) }] : undefined
            }
            description={
              archived
                ? 'Chưa có bảng nào được lưu trữ.'
                : canCreate
                  ? 'Tạo bảng đầu tiên để cả nhóm cùng theo dõi công việc.'
                  : 'Nhờ quản trị nhóm tạo bảng.'
            }
            icon="checkmark-square"
            title={archived ? 'Không có bảng lưu trữ' : 'Chưa có bảng'}
            tone={archived ? 'neutral' : 'success'}
          />
        ) : (
          <View className="gap-sm">
            {items.map((board) => (
              <View key={board.id} className="gap-3xs">
                <BoardCard board={board} onPress={() => openBoard(wsId, board.id)} />
                {/* Lối vào của feature khác (p4-06 "Báo cáo đóng góp") đi qua khe chung — `boards` không import feature đó. */}
                <BoardCardActionsSlot boardId={board.id} wsId={wsId} />
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
