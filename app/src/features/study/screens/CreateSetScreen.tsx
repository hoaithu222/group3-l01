import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useConnectionState } from '@/core/socket';
import { useCapabilities } from '@/shell/capabilities';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';

import { EditorExitDialog } from '../components/editor/EditorExitDialog';
import { SetForm, type SetFormResult } from '../components/SetForm';
import { useCreateSet } from '../queries/study-sets.queries';
import { useWorkspaceStudyAccess } from '../queries/workspace-access.queries';
import { readStudyLimits } from '../schemas/study.schemas';
import { hapticSaved } from '../utils/editor-haptics';
import { newLocalId } from '../utils/local-id';
import { setHref } from '../utils/study-routes';

/**
 * Tạo bộ học (app.md p4-01 §3 `CreateSet`; push thường, không `formSheet` — cùng lý do `CreateBoardScreen`).
 * `?workspaceId=` (từ hub nhóm) mở sẵn phạm vi "Trong nhóm": BE `STUDY_003` nếu WORKSPACE mà thiếu nhóm.
 * `Idempotency-Key` sinh MỘT LẦN lúc mở màn — bấm "Tạo" hai lần chỉ ra một bộ (cũng là khoá hàng đợi upload của ảnh bìa: bộ
 * chưa có id). Tạo xong → màn tổng quan bộ mới.
 */
export function CreateSetScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = useMemo(() => readStudyLimits(capabilities?.limits), [capabilities?.limits]);
  const workspace = useWorkspaceStudyAccess(workspaceId ?? '', Boolean(workspaceId));
  const [idempotencyKey] = useState(() => newLocalId('study-set-create'));
  const create = useCreateSet();
  const offline = useConnectionState() === 'offline';
  const [dirty, setDirty] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  function submit(values: SetFormResult): void {
    create.mutate(
      {
        idempotencyKey,
        payload: {
          confirmPublic: values.confirmPublic,
          // Tạo mới: chỉ có chuỗi hoặc `undefined` (chưa có ảnh bìa nào để gỡ).
          coverAssetId: values.coverAssetId ?? undefined,
          description: values.description || undefined,
          tags: values.tags,
          title: values.title,
          visibility: values.visibility,
          workspaceId: values.visibility === 'WORKSPACE' ? workspaceId : undefined,
        },
      },
      {
        onSuccess: (set) => {
          hapticSaved();
          showToast('success', 'Đã tạo bộ học. Thêm mục để bắt đầu học.');
          router.replace(setHref(set.id));
        },
      },
    );
  }

  return (
    <Screen
      header={
        <AppBar title="Tạo bộ học" onBack={() => (dirty ? setConfirmExit(true) : router.back())} />
      }
      keyboardAware
    >
      <SetForm
        canUseWorkspace={Boolean(workspaceId)}
        coverScopeId={idempotencyKey}
        errorMessage={create.error ? toErrorMessage(create.error) : null}
        initial={{
          description: '',
          tags: [],
          title: '',
          visibility: workspaceId ? 'WORKSPACE' : 'PRIVATE',
        }}
        initialCoverAssetId={null}
        limits={limits}
        offline={offline}
        submitLabel="Tạo bộ học"
        submitting={create.isPending}
        workspaceName={workspace.data?.name}
        onDirtyChange={setDirty}
        onSubmit={submit}
      />
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
