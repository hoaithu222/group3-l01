import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ActionMenuSheet, type ActionMenuItem } from '@/shared/ui/action-menu';
import { Alert } from '@/shared/ui/alert';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { Collaborator, DocumentVisibility } from '../api/docs.types';
import { AddCollaboratorSheet } from '../components/AddCollaboratorSheet';
import { CollaboratorsSection } from '../components/CollaboratorsSection';
import { VisibilitySection } from '../components/VisibilitySection';
import { COLLABORATOR_ROLE_LABEL } from '../constants/docs.constants';
import { useDisclosure, useSheetTarget } from '../hooks/useSheetTarget';
import {
  useAddCollaborators,
  useRemoveCollaborator,
  useUpdateDocument,
} from '../queries/docs.mutations';
import { useCollaborators, useDocument } from '../queries/docs.queries';
import { docsErrorMessage, isNotAvailable } from '../utils/docs-errors';

const PUBLIC_WARNING =
  'Mọi thành viên của nhóm sẽ xem và sửa được tài liệu này. Quyền của những người đã được mời vẫn giữ nguyên.';
const PRIVATE_WARNING =
  'Chỉ bạn và những người được mời xem, sửa được. Thành viên khác đang mở tài liệu sẽ bị ngắt kết nối ngay.';

/**
 * Chia sẻ (app.md §3 dòng "Chia sẻ"): "Ai xem được" (đổi PRIVATE → WORKSPACE cần xác nhận "Mọi thành viên sẽ xem được" và gửi `confirmPublic`), danh sách
 * cộng tác viên + vai, thêm người (chọn từ thành viên nhóm), đổi vai/gỡ. Mọi thao tác ghi cần `myPermissions.manage` (server tính) và tài liệu còn hoạt động;
 * không có thì màn chỉ đọc. Trạng thái rỗng: "Chỉ bạn" (riêng tư, chưa mời ai).
 */
export function DocumentShareScreen() {
  const { docId, wsId } = useLocalSearchParams<{ docId: string; wsId: string }>();
  const doc = useDocument(docId);
  const people = useCollaborators(docId);
  const update = useUpdateDocument(docId);
  const addRole = useAddCollaborators(docId);
  const remove = useRemoveCollaborator(docId);
  const add = useDisclosure();
  const person = useSheetTarget<Collaborator>();
  const confirm = useSheetTarget<DocumentVisibility>();

  const header = <AppBar title="Chia sẻ" onBack={router.back} />;
  if (doc.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-sm py-md">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </View>
      </Screen>
    );
  }
  if (!doc.data) {
    return (
      <Screen header={header}>
        <ScreenState
          action={
            isNotAvailable(doc.error)
              ? undefined
              : { label: 'Thử lại', onPress: () => void doc.refetch() }
          }
          description={
            isNotAvailable(doc.error)
              ? 'Tài liệu đã bị xoá, hoặc bạn không còn quyền xem.'
              : docsErrorMessage(doc.error)
          }
          state={isNotAvailable(doc.error) ? 'forbidden' : 'error'}
          title="Không mở được thông tin chia sẻ"
        />
      </Screen>
    );
  }

  const data = doc.data;
  const canManage = data.myPermissions.manage && data.status === 'ACTIVE';
  const list = people.data ?? [];

  const applyVisibility = () => {
    const next = confirm.target;
    if (!next) return;
    update.mutate(
      {
        expectedVersion: data.version,
        visibility: next,
        ...(next === 'WORKSPACE' ? { confirmPublic: true } : {}),
      },
      {
        onError: (error) => showToast('error', docsErrorMessage(error)),
        onSettled: confirm.close,
        onSuccess: () => showToast('success', 'Đã đổi chế độ chia sẻ'),
      },
    );
  };

  const target = person.target;
  const menu: ActionMenuItem[] = target
    ? [
        {
          icon: 'edit',
          key: 'role',
          label: `Đổi thành “${COLLABORATOR_ROLE_LABEL[target.role === 'EDITOR' ? 'VIEWER' : 'EDITOR']}”`,
          onPress: () =>
            addRole.mutate(
              { role: target.role === 'EDITOR' ? 'VIEWER' : 'EDITOR', userIds: [target.userId] },
              { onError: (error) => showToast('error', docsErrorMessage(error)) },
            ),
        },
        {
          icon: 'delete',
          key: 'remove',
          label: 'Gỡ khỏi tài liệu',
          onPress: () =>
            remove.mutate(target.userId, {
              onError: (error) => showToast('error', docsErrorMessage(error)),
              onSuccess: () => showToast('success', `Đã gỡ ${target.name}`),
            }),
          tone: 'danger',
        },
      ]
    : [];

  return (
    <Screen header={header}>
      <View className="gap-xl py-xs">
        {data.status === 'ARCHIVED' ? (
          <Alert description="Tài liệu đã lưu trữ — không thay đổi chia sẻ được." tone="info" />
        ) : null}
        <VisibilitySection
          canMakePrivate={data.myRole === 'CREATOR'}
          canManage={canManage}
          value={data.visibility}
          onChange={(next) => next !== data.visibility && confirm.open(next)}
        />
        <CollaboratorsSection
          canManage={canManage}
          collaborators={list}
          errorMessage={people.isError ? docsErrorMessage(people.error) : null}
          loading={people.isLoading}
          ready={people.isSuccess}
          visibility={data.visibility}
          onAdd={add.open}
          onPressPerson={person.open}
        />
      </View>
      <AddCollaboratorSheet
        docId={docId}
        existing={list}
        visible={add.visible}
        wsId={wsId}
        onClose={add.close}
      />
      <ActionMenuSheet
        items={menu}
        title={target?.name}
        visible={person.visible}
        onClose={person.close}
      />
      <Dialog
        description={confirm.target === 'WORKSPACE' ? PUBLIC_WARNING : PRIVATE_WARNING}
        primaryAction={{ label: 'Xác nhận', loading: update.isPending, onPress: applyVisibility }}
        secondaryAction={{ disabled: update.isPending, label: 'Huỷ', onPress: confirm.close }}
        title={confirm.target === 'WORKSPACE' ? 'Chia sẻ cho cả nhóm?' : 'Chuyển thành riêng tư?'}
        variant="warning"
        visible={confirm.visible}
        onClose={confirm.close}
      />
    </Screen>
  );
}
