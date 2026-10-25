import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { isNetworkError } from '@/shared/utils/errors';
import { showToast } from '@/shared/utils/toast.utils';

import type { ModerationKind } from '../api/study.types';
import { SetHiddenPanel } from '../components/moderation/SetHiddenPanel';
import { SetModerationSheets } from '../components/moderation/SetModerationSheets';
import { SetOverviewAppBar } from '../components/overview/SetOverviewAppBar';
import { SetOverviewSkeleton } from '../components/overview/SetOverviewSkeleton';
import { ReportSetSheet } from '../components/ReportSetSheet';
import { SetOverviewHeader } from '../components/SetOverviewHeader';
import { SetStudyActions } from '../components/SetStudyActions';
import { StopSrDialog } from '../components/sr/StopSrDialog';
import { useSetSrActions } from '../hooks/useSetSrActions';
import { useStudyItems } from '../queries/study-items.queries';
import { useDeleteSet, useDuplicateSet, useStudySet } from '../queries/study-sets.queries';
import { newLocalId } from '../utils/local-id';
import { setEditHref, setHref, STUDY_HOME } from '../utils/study-routes';

/**
 * Tổng quan một bộ học (app.md p4-01 §3 `SetOverview`). Nút do `myPermissions` của SERVER quyết (tác giả sửa/xoá,
 * người đọc sao chép/báo cáo) — client không suy từ vai trò. Mục được tải sẵn (`useStudyItems`) để "Học thẻ" mở tức
 * thì và chạy lại từ cache khi mất mạng. "Ôn theo lịch" (p4-02) đăng ký SR cả bộ rồi mở `/study/sr?setId=`. OWNER/ADMIN nhóm (`myPermissions.hide|unhide`)
 * ẩn/khôi phục bộ WORKSPACE qua tấm xác nhận có lý do (`SetModerationSheets`); mở bộ đã ẩn thì họ chỉ thấy thông tin + nút "Khôi phục" (`SetHiddenPanel`), không tải mục.
 *
 * ⚠️ Bố cục: MỘT hành động chính ("Học thẻ", trong `SetStudyActions`). Thao tác QUẢN LÝ bộ (sửa thông tin, sao chép, báo
 * cáo, ngừng ôn theo lịch, xoá) nằm ở thanh tiêu đề (`SetOverviewAppBar`) — "Sửa nội dung" là icon riêng cho tác giả, phần còn lại gom vào menu "⋯"; xoá là hàng
 * đỏ CUỐI menu (vẫn qua hộp thoại xác nhận). Trước đây tất cả là nút rộng hết bề ngang xếp dưới màn (tối đa 10 nút,
 * nút "Xoá bộ học" nằm ngay dưới "Báo cáo").
 *
 * ⚠️ Hình dạng: điện thoại xếp DỌC (hero → nút chính → ô luyện tập); từ `tablet:` (600dp, gồm cả điện thoại xoay ngang) chia HAI CỘT — hero bên trái,
 * nút chính + ô luyện tập bên phải — nên `constrained={false}` (trần 720dp `max-w-content` của `Screen` sẽ ép mỗi cột về ~330dp, khổ điện
 * thoại). Hai cột là class `tablet:flex-row`, không phải hook: kéo chia đôi màn hình không vẽ lại cả trang.
 */
export function SetOverviewScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const set = useStudySet(setId);
  // ⚠️ OWNER/ADMIN nhóm mở bộ ĐÃ ẨN (`myPermissions.unhide`) chỉ có `meta`, KHÔNG có `content` (be `resolveWith`) ⇒ `GET /items` là 404: đừng tải mục.
  const canReadItems = Boolean(set.data) && set.data?.myPermissions.unhide !== true;
  const items = useStudyItems(setId, canReadItems);
  // Màn nằm DƯỚI học thẻ/trắc nghiệm/thi thử/soạn (vẫn mounted) — người cùng nhóm sửa bộ thì quay lại mới thấy.
  useRefetchOnFocus(set);
  useRefetchOnFocus(items, canReadItems);
  const duplicate = useDuplicateSet(setId);
  const remove = useDeleteSet();
  const sr = useSetSrActions(setId);
  const [duplicateKey] = useState(() => newLocalId('study-set-duplicate'));
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState<ModerationKind | null>(null);

  const data = set.data;
  const editable = data?.myPermissions.edit === true && data.status === 'ACTIVE';
  // Làm mới hỏng vì MẤT MẠNG mà đã có bản tải trước ⇒ giữ nội dung (chỉ lỗi có phản hồi — 404/403 — mới là "không còn khả dụng").
  const offlineError = isNetworkError(set.error);

  function copy(): void {
    duplicate.mutate(
      { idempotencyKey: duplicateKey, payload: { targetVisibility: 'PRIVATE' } },
      {
        onError: (error) => showToast('error', toErrorMessage(error)),
        onSuccess: (created) => {
          showToast('success', 'Đã sao chép về bộ học của bạn.');
          router.replace(setHref(created.id));
        },
      },
    );
  }

  function confirmDelete(): void {
    remove.mutate(setId, {
      onError: (error) => showToast('error', toErrorMessage(error)),
      onSuccess: () => {
        setDeleting(false);
        router.replace(STUDY_HOME);
      },
    });
  }

  return (
    <Screen
      constrained={false}
      header={
        <SetOverviewAppBar
          data={data}
          duplicating={duplicate.isPending}
          editable={editable}
          setId={setId}
          onCopy={copy}
          onDelete={() => setDeleting(true)}
          onHide={() => setModerating('hide')}
          onReport={() => setReporting(true)}
          onStopSr={sr.openStop}
          onUnhide={() => setModerating('unhide')}
        />
      }
    >
      {set.isLoading ? (
        <SetOverviewSkeleton />
      ) : !data && offlineError ? (
        // Mất mạng ≠ bộ bị xoá (`mobile-ux.md`): trước đây mọi lỗi đều ra "không còn khả dụng" + ổ khoá, người học tưởng mất bộ.
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void set.refetch() }}
          fullscreen={false}
          state="offline"
        />
      ) : !data || (set.isError && !offlineError) ? (
        <EmptyState
          actions={[{ label: 'Về danh sách', onPress: () => router.replace(STUDY_HOME) }]}
          description="Bộ học đã bị xoá, bị ẩn hoặc bạn không còn quyền xem."
          icon="lock"
          title="Bộ học không còn khả dụng"
          tone="warning"
        />
      ) : (
        <View className="gap-md py-xs tablet:flex-row tablet:items-start tablet:gap-xl">
          <View className="tablet:flex-1">
            <SetOverviewHeader items={canReadItems ? items.data?.items : undefined} set={data} />
          </View>
          <View className="gap-md tablet:flex-1">
            {data.myPermissions.unhide ? (
              <SetHiddenPanel onRestore={() => setModerating('unhide')} />
            ) : data.itemCount === 0 ? (
              <EmptyState
                actions={
                  editable
                    ? [{ label: 'Thêm mục', onPress: () => router.push(setEditHref(setId)) }]
                    : undefined
                }
                description={
                  editable
                    ? 'Thêm thẻ ghi nhớ hoặc câu hỏi để bắt đầu học.'
                    : 'Tác giả chưa thêm mục nào.'
                }
                icon="book"
                title="Bộ chưa có mục"
                tone="success"
              />
            ) : (
              <SetStudyActions
                enrolling={sr.enrolling}
                hasQuiz={data.hasQuiz}
                setId={setId}
                onStartSr={sr.startSr}
              />
            )}
          </View>
        </View>
      )}

      <ReportSetSheet setId={setId} visible={reporting} onClose={() => setReporting(false)} />
      <SetModerationSheets
        open={moderating}
        setId={setId}
        setTitle={data?.title ?? ''}
        onClose={() => setModerating(null)}
      />
      <StopSrDialog
        loading={sr.isStopPending}
        visible={sr.stopping}
        onClose={sr.closeStop}
        onConfirm={sr.confirmStop}
      />
      <Dialog
        description={`Bộ "${data?.title ?? ''}" và toàn bộ mục học sẽ bị xoá. Người đã sao chép vẫn giữ bản sao của họ.`}
        primaryAction={{ label: 'Xoá bộ học', loading: remove.isPending, onPress: confirmDelete }}
        secondaryAction={{
          disabled: remove.isPending,
          label: 'Huỷ',
          onPress: () => setDeleting(false),
        }}
        title="Xoá bộ học?"
        variant="warning"
        visible={deleting}
        onClose={() => setDeleting(false)}
      />
    </Screen>
  );
}
