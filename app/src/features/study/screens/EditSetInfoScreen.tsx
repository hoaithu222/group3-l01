import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { useCapabilities } from '@/shell/capabilities';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { showToast } from '@/shared/utils/toast.utils';

import { EditorExitDialog } from '../components/editor/EditorExitDialog';
import { SetForm, type SetFormResult } from '../components/SetForm';
import { usePatchSet, useStudySet } from '../queries/study-sets.queries';
import { readStudyLimits } from '../schemas/study.schemas';
import { hapticSaved } from '../utils/editor-haptics';
import { getErrorCode, STUDY_ERROR } from '../utils/error-info';

/**
 * Sửa thông tin bộ (tiêu đề, mô tả, thẻ, phạm vi) — `PATCH` với `expectedVersion` (CAS). Chỉ TÁC GIẢ
 * (`myPermissions.edit`); bộ đã bị ẩn (`STUDY_004`) không sửa được. `409 RES_003`: có người sửa trước — báo và tải lại,
 * giữ nguyên nội dung đang nhập (form không bị dựng lại).
 */
export function EditSetInfoScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readStudyLimits(capabilities?.limits), [capabilities?.limits]);
  const set = useStudySet(setId);
  const patch = usePatchSet(setId);
  const offline = useConnectionState() === 'offline';
  const [dirty, setDirty] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  function submit(values: SetFormResult): void {
    if (!set.data) return;
    patch.mutate(
      {
        confirmPublic: values.confirmPublic,
        // `undefined` = không đổi (JSON bỏ trường); `null` = gỡ ảnh bìa.
        coverAssetId: values.coverAssetId,
        description: values.description || null,
        expectedVersion: set.data.version,
        tags: values.tags,
        title: values.title,
        visibility: values.visibility,
      },
      {
        onError: (error) => {
          if (getErrorCode(error) === STUDY_ERROR.VERSION_CONFLICT) void set.refetch();
        },
        onSuccess: () => {
          hapticSaved();
          showToast('success', 'Đã lưu thông tin bộ học.');
          router.back();
        },
      },
    );
  }

  const conflict = getErrorCode(patch.error) === STUDY_ERROR.VERSION_CONFLICT;
  const editable = set.data?.myPermissions.edit === true && set.data.status === 'ACTIVE';

  return (
    <Screen
      header={
        <AppBar
          title="Thông tin bộ học"
          onBack={() => (dirty ? setConfirmExit(true) : router.back())}
        />
      }
      keyboardAware
    >
      {set.isLoading ? (
        <View className="gap-xl py-xs">
          <Skeleton className="h-56 rounded-md" />
          <Skeleton className="h-72 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      ) : !set.data && isNetworkError(set.error) ? (
        // Mất mạng ≠ mất quyền: nói đúng là lỗi KẾT NỐI + "Thử lại" (trước đây ra ổ khoá "không còn khả dụng").
        <ScreenState
          action={{ label: 'Thử lại', onPress: () => void set.refetch() }}
          fullscreen={false}
          state="offline"
        />
      ) : !set.data || (set.isError && !isNetworkError(set.error)) ? (
        <EmptyState
          description="Bộ học không tồn tại hoặc bạn không còn quyền xem."
          icon="lock"
          title="Bộ học không còn khả dụng"
          tone="warning"
        />
      ) : !editable ? (
        <EmptyState
          description="Chỉ tác giả mới sửa được bộ học, và bộ bị ẩn thì không sửa được."
          icon="lock"
          title="Không thể sửa"
          tone="warning"
        />
      ) : (
        <SetForm
          canUseWorkspace={Boolean(set.data.workspaceId)}
          coverScopeId={set.data.id}
          errorMessage={
            conflict
              ? 'Bộ học vừa được sửa ở nơi khác. Đã tải bản mới — kiểm tra lại rồi bấm Lưu.'
              : patch.error
                ? toErrorMessage(patch.error)
                : null
          }
          initial={{
            description: set.data.description ?? '',
            tags: set.data.tags,
            title: set.data.title,
            visibility: set.data.visibility,
          }}
          initialCoverAssetId={set.data.coverAssetId}
          limits={limits}
          offline={offline}
          submitLabel="Lưu"
          submitting={patch.isPending}
          onDirtyChange={setDirty}
          onSubmit={submit}
        />
      )}
      <EditorExitDialog
        visible={confirmExit}
        onClose={() => setConfirmExit(false)}
        onDiscard={() => {
          setConfirmExit(false);
          router.back();
        }}
      />
    </Screen>
  );
}
