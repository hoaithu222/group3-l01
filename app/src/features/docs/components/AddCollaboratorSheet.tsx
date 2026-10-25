import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Checkbox } from '@/shared/ui/checkbox';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { showToast } from '@/shared/utils/toast.utils';

import type { Collaborator, CollaboratorRole } from '../api/docs.types';
import { COLLABORATOR_ROLE_LABEL, DOCS_LIMITS } from '../constants/docs.constants';
import { useAddCollaborators } from '../queries/docs.mutations';
import { useMemberOptions } from '../queries/docs.queries';
import { docsErrorMessage } from '../utils/docs-errors';

export interface AddCollaboratorSheetProps {
  docId: string;
  existing: Collaborator[];
  visible: boolean;
  wsId: string;
  onClose: () => void;
}

/**
 * Mời thành viên nhóm vào tài liệu (app.md §3 "Chia sẻ"): chọn nhiều người + MỘT vai chung ("Được sửa"/"Chỉ xem"). Người đã là cộng tác viên
 * không hiện (đổi vai họ ở menu của hàng). BE nhận tối đa 20 người mỗi lượt và 50 người cộng tác mỗi tài liệu; người tạo/khách không hiện ở danh
 * sách thành viên. Lỗi `DOC_003` (không thuộc nhóm)/`DOC_004` (đủ người) hiện trong tấm.
 *
 * ✅ Hai nhóm có tiêu đề (`Section`): vai chung · danh sách người. Tải/rỗng/lỗi dùng khung xương + `EmptyState` gọn (lỗi có "Thử lại")
 * thay cho dòng chữ trơn; lỗi gửi ghim ở khe `alert`, câu "tối đa N người" là `hint` ngay trên nút nó giải thích.
 */
export function AddCollaboratorSheet({
  docId,
  existing,
  onClose,
  visible,
  wsId,
}: AddCollaboratorSheetProps) {
  const members = useMemberOptions(wsId, visible);
  const add = useAddCollaborators(docId);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<CollaboratorRole>('EDITOR');

  const taken = new Set(existing.map((c) => c.userId));
  const options = (members.data ?? []).filter((m) => !taken.has(m.userId));
  const limit = DOCS_LIMITS.addCollaboratorsPerRequestMax;
  const full = selected.length >= limit;

  const close = () => {
    add.reset();
    setSelected([]);
    onClose();
  };

  const submit = () =>
    add.mutate(
      { role, userIds: selected },
      {
        onSuccess: () => {
          showToast('success', 'Đã thêm người cộng tác');
          close();
        },
      },
    );

  let people;
  if (members.isLoading) {
    people = (
      <View>
        <SkeletonParagraphWithIcon className="py-xs" />
        <SkeletonParagraphWithIcon className="py-xs" />
        <SkeletonParagraphWithIcon className="py-xs" />
      </View>
    );
  } else if (members.isError) {
    people = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void members.refetch() }]}
        description={docsErrorMessage(members.error)}
        icon="alert-warning"
        size="compact"
        title="Không tải được danh sách thành viên"
        tone="danger"
      />
    );
  } else if (options.length === 0) {
    people = (
      <EmptyState
        description="Không còn thành viên nào để thêm."
        icon="user"
        size="compact"
        tone="neutral"
      />
    );
  } else {
    people = (
      <View>
        {options.map((member) => (
          <View key={member.userId} className="min-h-[44px] justify-center">
            <Checkbox
              checked={selected.includes(member.userId)}
              disabled={full && !selected.includes(member.userId)}
              label={member.name}
              onChange={(on) =>
                setSelected((prev) =>
                  on
                    ? [...new Set([...prev, member.userId])]
                    : prev.filter((id) => id !== member.userId),
                )
              }
            />
          </View>
        ))}
      </View>
    );
  }

  return (
    <BottomSheet
      alert={
        add.error ? <Alert description={docsErrorMessage(add.error)} tone="error" /> : undefined
      }
      footer={
        <SheetActions
          hint={full ? `Tối đa ${limit} người mỗi lượt.` : undefined}
          primary={{
            disabled: selected.length === 0,
            label: selected.length > 0 ? `Thêm ${selected.length} người` : 'Chọn người để thêm',
            loading: add.isPending,
            onPress: submit,
          }}
        />
      }
      scrollable
      title="Thêm người cộng tác"
      visible={visible}
      onClose={close}
    >
      <View className="gap-md">
        <Section title="Quyền của người được thêm" tone="default">
          <View
            accessibilityLabel="Quyền"
            accessibilityRole="radiogroup"
            className="flex-row gap-xs"
          >
            {(['EDITOR', 'VIEWER'] as const).map((value) => (
              <Chip
                key={value}
                label={COLLABORATOR_ROLE_LABEL[value]}
                role="radio"
                selected={role === value}
                onPress={() => setRole(value)}
              />
            ))}
          </View>
        </Section>
        <Section title="Thành viên nhóm" tone="default">
          {people}
        </Section>
      </View>
    </BottomSheet>
  );
}
