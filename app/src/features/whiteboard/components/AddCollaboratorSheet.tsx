import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Section } from '@/shared/ui/section';
import { showToast } from '@/shared/utils/toast.utils';

import type { Collaborator, CollaboratorRole } from '../api/whiteboard.types';
import { COLLABORATOR_ROLE_LABEL, WB_UI_LIMITS } from '../constants/whiteboard.constants';
import { useAddCollaborators } from '../queries/whiteboard.mutations';
import { useMemberOptions } from '../queries/whiteboard.queries';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';
import { MemberPickList } from './MemberPickList';

export interface AddCollaboratorSheetProps {
  existing: Collaborator[];
  onClose: () => void;
  visible: boolean;
  wbId: string;
  wsId: string;
}

const ROLES: readonly CollaboratorRole[] = ['EDITOR', 'VIEWER'];
const ROLE_GROUP_TITLE = 'Quyền cho người được thêm';

/**
 * Mời thành viên nhóm vào bảng (app.md §3 "Chia sẻ"): chọn nhiều người + MỘT vai chung ("Được vẽ"/"Chỉ xem"). Người đã là cộng tác viên không hiện (đổi vai họ ở
 * menu của hàng). BE nhận tối đa 20 người mỗi lượt và 50 người cộng tác mỗi bảng; người tạo/khách không hiện ở danh sách thành viên. Lỗi `WB_003` (không thuộc
 * nhóm)/`WB_004` (đủ người) hiện ở khối cảnh báo của tấm.
 *
 * ✅ Nhóm chọn quyền có TIÊU ĐỀ và ĐỨNG YÊN ở khe `search` (cuộn danh sách dài không cuốn mất; trước đây hai chip trần trông như bộ lọc danh sách);
 * trần 20 người nói trước ở `description`; lỗi gửi ở `alert` (ngay dưới đầu tấm, không nằm tận cuối danh sách). Thân là `MemberPickList`.
 */
export function AddCollaboratorSheet({
  existing,
  onClose,
  visible,
  wbId,
  wsId,
}: AddCollaboratorSheetProps) {
  const members = useMemberOptions(wsId, visible);
  const add = useAddCollaborators(wbId);
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<CollaboratorRole>('EDITOR');

  const taken = new Set(existing.map((c) => c.userId));
  const options = (members.data ?? []).filter((m) => !taken.has(m.userId));
  const limit = WB_UI_LIMITS.addCollaboratorsPerRequestMax;

  const close = () => {
    add.reset();
    setSelected([]);
    onClose();
  };

  const toggle = (userId: string) =>
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );

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

  return (
    <BottomSheet
      alert={
        add.error ? (
          <Alert description={whiteboardErrorMessage(add.error)} tone="error" />
        ) : undefined
      }
      description={`Chọn thành viên của nhóm để mời vào bảng, tối đa ${String(limit)} người mỗi lượt.`}
      footer={
        <Button
          disabled={selected.length === 0}
          fullWidth
          label={selected.length > 0 ? `Thêm ${selected.length} người` : 'Chọn người để thêm'}
          loading={add.isPending}
          onPress={submit}
        />
      }
      padded={false}
      scrollable
      search={
        <Section title={ROLE_GROUP_TITLE} tone="default">
          {/* Hai chip CHIA ĐỀU hàng (`fullWidth`) — vai chung cho MỌI người được chọn ở lượt này, không phải bộ lọc danh sách. */}
          <View
            accessibilityLabel={ROLE_GROUP_TITLE}
            accessibilityRole="radiogroup"
            className="flex-row gap-xs"
          >
            {ROLES.map((value) => (
              <Chip
                key={value}
                fullWidth
                label={COLLABORATOR_ROLE_LABEL[value]}
                role="radio"
                selected={role === value}
                onPress={() => setRole(value)}
              />
            ))}
          </View>
        </Section>
      }
      title="Thêm người cộng tác"
      visible={visible}
      onClose={close}
    >
      <MemberPickList
        errorMessage={members.isError ? whiteboardErrorMessage(members.error) : null}
        limit={limit}
        loading={members.isLoading}
        options={options}
        selected={selected}
        onRetry={() => void members.refetch()}
        onToggle={toggle}
      />
    </BottomSheet>
  );
}
