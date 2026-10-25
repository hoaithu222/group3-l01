import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { PATHS } from '@/shell/config';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { isNetworkError } from '@/shared/utils/errors';

import type { StudySetSummaryDto } from '../api/study.types';
import { StudySetList } from '../components/StudySetList';
import { StudySetListSkeleton } from '../components/StudySetListSkeleton';
import { useWorkspaceStudyAccess } from '../queries/workspace-access.queries';
import { newSetHref, setHref } from '../utils/study-routes';

/**
 * "Học" của một NHÓM (app.md p4-01 §3 `WorkspaceStudy`): bộ WORKSPACE của nhóm + "Tạo bộ cho nhóm". Khách (GUEST) và
 * người không phải thành viên nhận 404 trung tính từ BE ⇒ "Không truy cập được" (không lộ nhóm có tồn tại). Nhóm đã
 * lưu trữ (ARCHIVED) chỉ xem — ẩn nút tạo. Mất quyền giữa chừng do `[wsId]/_layout.tsx` (`useWorkspaceSocket`) xử lý.
 *
 * Đầu danh sách có banner giới thiệu (cuộn cùng danh sách, không chiếm chỗ cố định); đang tải ⇒ khung xương đúng khuôn thẻ bộ.
 */
export function WorkspaceStudyScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const access = useWorkspaceStudyAccess(wsId);
  const offline = useConnectionState() === 'offline';

  const role = access.data?.myRole;
  // ⚠️ Lỗi MẠNG không phải "bị chặn": không tới được máy chủ thì chưa biết quyền — có bản đã tải thì vẫn cho xem, chưa có thì báo
  // ngoại tuyến + "Thử lại" (bên dưới). Chỉ lỗi CÓ phản hồi (404 trung tính của BE) hoặc vai GUEST mới là "Không truy cập được".
  const offlineError = isNetworkError(access.error);
  const denied = (access.isError && !offlineError) || role === 'GUEST';
  const canCreate =
    access.data?.status === 'ACTIVE' && role !== undefined && role !== 'GUEST' && !offline;
  const create = () => router.push(newSetHref(wsId));

  return (
    <Screen
      header={
        <AppBar
          actions={
            canCreate ? (
              <Button
                accessibilityLabel="Tạo bộ học cho nhóm"
                iconLeft="add"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={create}
              />
            ) : undefined
          }
          title={access.data ? `Học · ${access.data.name}` : 'Học'}
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 py-xs">
        {access.isLoading ? (
          <StudySetListSkeleton />
        ) : offlineError && !access.data ? (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void access.refetch() }}
            state="offline"
          />
        ) : denied ? (
          <EmptyState
            actions={[
              { label: 'Về danh sách nhóm', onPress: () => router.replace(PATHS.WORKSPACES) },
            ]}
            description="Nhóm không tồn tại hoặc bạn không có quyền xem bộ học của nhóm này."
            icon="lock"
            title="Không truy cập được"
            tone="warning"
          />
        ) : (
          <StudySetList
            emptyActions={canCreate ? [{ label: 'Tạo bộ cho nhóm', onPress: create }] : undefined}
            emptyDescription="Thành viên có thể tạo bộ học và chia sẻ cho cả nhóm cùng ôn."
            emptyTitle="Nhóm chưa có bộ học"
            header={
              <View className="px-md pb-sm pt-xs">
                {/* Tông `success` = màu của phạm vi "Trong nhóm" ở thẻ bộ (`StudySetCard`) — nhóm nhìn ra cùng một màu ở mọi nơi. */}
                <ModuleBanner
                  description="Thẻ ghi nhớ và câu hỏi để cả nhóm cùng ôn."
                  icon="add-team"
                  title="Bộ học của nhóm"
                  tone="success"
                />
              </View>
            }
            params={{ scope: 'workspace', workspaceId: wsId }}
            showOwner
            onOpen={(set: StudySetSummaryDto) => router.push(setHref(set.id))}
          />
        )}
      </View>
    </Screen>
  );
}
