import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';

import type { ChannelGrant, GrantLevel } from '../api';
import { AccessSourceNote } from './AccessSourceNote';

const LEVEL_LABEL: Record<GrantLevel, string> = { MANAGER: 'Quản lý', MEMBER: 'Thành viên' };

export interface GrantRowProps {
  /** Xem `myPermissions.canManageGrants` — người xem KHÔNG quản được thì hàng chỉ để đọc. */
  canManage: boolean;
  grant: ChannelGrant;
  loading?: boolean;
  onChangeLevel: (level: GrantLevel) => void;
  onRevoke: () => void;
}

/**
 * Một dòng grant (app.md §3): level + nguồn, đổi cấp bằng hai chip, thu hồi
 * phải GÕ LẠI TÊN để xác nhận (cùng khuôn `TransferOwnerSheet` của p1-01).
 *
 * `source === 'ROLE'` (P3-04, chưa tới) không sửa/thu hồi được qua đây —
 * BE giữ nguyên grant loại đó khi revoke (be.md §5.4: "ROLE giữ — P1").
 */
export function GrantRow({ canManage, grant, loading, onChangeLevel, onRevoke }: GrantRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const nameMatches = confirmName.trim().length > 0 && confirmName.trim().toLowerCase() === grant.name.toLowerCase();
  const canEditThis = canManage && grant.source === 'DIRECT';

  return (
    // Hai TẦNG khi sửa được: (1) avatar · tên + nguồn · nút thu hồi, (2) hai chip cấp. Bản cũ xếp cả avatar + tên + 2 chip +
    // nút xoá trên MỘT hàng: máy 360dp chỉ chừa ~60dp cho tên (cắt "Ngu…") — tên là thứ người quản lý cần đọc nhất để khỏi
    // thu hồi nhầm người.
    <View className="gap-xs px-md py-sm">
      <View className="flex-row items-center gap-sm">
        <Avatar name={grant.name} size="sm" />
        <View className="flex-1 gap-3xs">
          <Text className="text-body-lg text-fg-1" numberOfLines={1}>
            {grant.name}
          </Text>
          <AccessSourceNote sources={grant.source === 'ROLE' ? [`ROLE:${grant.roleRef ?? ''}`] : ['DIRECT']} />
        </View>

        {canEditThis ? (
          <Button
            accessibilityLabel={`Thu hồi quyền của ${grant.name}`}
            iconLeft="delete"
            iconOnly
            size="xs"
            variant="danger-secondary"
            onPress={() => setConfirmOpen(true)}
          />
        ) : (
          // Cấp quyền bằng huy hiệu CÓ CHỮ (quản lý nổi lên `info`, thành viên `neutral`) — màu chỉ phụ.
          <Badge label={LEVEL_LABEL[grant.level]} size="sm" variant={grant.level === 'MANAGER' ? 'info' : 'neutral'} />
        )}
      </View>

      {canEditThis ? (
        <View className="flex-row items-center gap-2xs">
          {(['MEMBER', 'MANAGER'] as const).map((level) => (
            <Chip
              key={level}
              disabled={loading}
              label={LEVEL_LABEL[level]}
              role="radio"
              selected={grant.level === level}
              size="sm"
              onPress={() => onChangeLevel(level)}
            />
          ))}
        </View>
      ) : null}

      <Dialog
        description={`Người này sẽ mất quyền xem kênh riêng tư ngay lập tức. Gõ lại tên "${grant.name}" để xác nhận.`}
        dismissOnBackdrop={!loading}
        primaryAction={{
          disabled: !nameMatches,
          label: 'Thu hồi',
          loading,
          onPress: () => {
            onRevoke();
            setConfirmOpen(false);
            setConfirmName('');
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirmOpen(false) }}
        title={`Thu hồi quyền của ${grant.name}?`}
        variant="warning"
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <Input
          autoCapitalize="words"
          label={`Gõ lại tên "${grant.name}"`}
          placeholder={grant.name}
          value={confirmName}
          onChangeText={setConfirmName}
        />
      </Dialog>
    </View>
  );
}
