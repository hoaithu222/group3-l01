import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Card } from '@/shared/ui/card';
import { Dialog } from '@/shared/ui/modal';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { RoleGrant, RoleRef } from '../api';
import { useAddRoleGrant, useRemoveRoleGrant } from '../queries/grants.queries';
import { useRoleGrantPreview } from '../queries/role-grant-preview.queries';
import { ROLE_REF_LABEL } from '../utils/access-source';

const ROLE_OPTIONS: { description: string; roleRef: RoleRef }[] = [
  { roleRef: 'ADMIN', description: 'Chủ nhóm và quản trị viên của nhóm.' },
  { roleRef: 'MEMBER', description: 'Chủ nhóm, quản trị viên và thành viên — không gồm khách.' },
];

export interface RoleGrantSectionProps {
  chId: string;
  roles: readonly RoleGrant[];
  wsId: string;
}

interface Pending {
  enable: boolean;
  roleRef: RoleRef;
}

/**
 * "Cấp theo vai trò" của kênh RIÊNG TƯ (app.md p3-04 §3) — chỉ MANAGER thấy (màn cha lọc).
 * Bật/tắt qua hộp thoại xác nhận vì hệ quả LỚN và khó thấy: cấp cho cả một vai trò nghĩa là
 * mọi người thuộc vai trò đó đọc được TOÀN BỘ lịch sử kênh (quyết định P0 — README §2), và
 * người mới vào vai trò sau này cũng tự đọc được. Hộp thoại bật nêu "Khoảng N người".
 *
 * Role grant chỉ cấp MEMBER (đọc/ghi), không bao giờ MANAGER (README §2) nên không có chọn cấp.
 * OWNER/ADMIN không tự đọc kênh riêng tư — đây là hành động chủ ý của người quản lý kênh.
 */
export function RoleGrantSection({ chId, roles, wsId }: RoleGrantSectionProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const addRole = useAddRoleGrant(chId);
  const removeRole = useRemoveRoleGrant(chId);
  const preview = useRoleGrantPreview(wsId, pending?.enable ? pending.roleRef : null);

  const granted = new Set(roles.map((role) => role.roleRef));
  const busy = addRole.isPending || removeRole.isPending;
  const label = pending ? ROLE_REF_LABEL[pending.roleRef] : '';

  function confirm(): void {
    if (!pending) return;
    const mutation = pending.enable ? addRole : removeRole;
    mutation.mutate(pending.roleRef, {
      onSuccess: () => {
        hapticSuccess(); // việc đã xác nhận ở hộp thoại vừa xong
        setPending(null);
        showToast('success', pending.enable ? `Đã cấp quyền cho ${label}.` : `Đã gỡ quyền của ${label}.`);
      },
      onError: (error) => showToast('error', toErrorMessage(error)),
    });
  }

  const enableText =
    preview.total !== undefined
      ? `Khoảng ${preview.total} người sẽ xem được toàn bộ lịch sử kênh, kể cả tin đã gửi trước đây.`
      : 'Những người thuộc vai trò này sẽ xem được toàn bộ lịch sử kênh, kể cả tin đã gửi trước đây.';

  return (
    <>
      <Card title="Cấp theo vai trò">
        <View className="gap-md">
          {ROLE_OPTIONS.map((option) => (
            <Toggle
              key={option.roleRef}
              description={option.description}
              disabled={busy}
              label={ROLE_REF_LABEL[option.roleRef]}
              value={granted.has(option.roleRef)}
              onChange={(enable) => setPending({ enable, roleRef: option.roleRef })}
            />
          ))}
        </View>
      </Card>

      <Dialog
        description={
          pending?.enable
            ? `${enableText} Người mới vào vai trò này sau này cũng tự xem được.`
            : 'Những người chỉ có quyền xem kênh qua vai trò này sẽ mất quyền ngay. Người còn được cấp trực tiếp không bị ảnh hưởng.'
        }
        dismissOnBackdrop={!busy}
        primaryAction={{ label: pending?.enable ? 'Cấp quyền' : 'Gỡ quyền', loading: busy, onPress: confirm }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setPending(null) }}
        title={pending?.enable ? `Cấp cho ${label}?` : `Gỡ quyền của ${label}?`}
        variant="warning"
        visible={pending !== null}
        onClose={() => setPending(null)}
      />
    </>
  );
}
