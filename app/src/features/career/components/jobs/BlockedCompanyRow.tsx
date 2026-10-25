import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { BlockedCompany } from '../../api/recruiter.types';

export interface BlockedCompanyRowProps {
  blocked: BlockedCompany;
  /** Mất mạng: khoá nút (bỏ chặn mà không tới được server sẽ lệch giữa hai thiết bị). */
  disabled: boolean;
  onUnblock: (blocked: BlockedCompany) => void;
}

/** Một doanh nghiệp đã chặn (app.md §3): logo, tên, ngày chặn, "Bỏ chặn". Chữ nằm trong khối `flex-1` để nút bên phải không bị đẩy ra khỏi màn ở máy 320dp. */
export function BlockedCompanyRow({ blocked, disabled, onUnblock }: BlockedCompanyRowProps) {
  const { company } = blocked;
  return (
    <View className="min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 py-sm">
      <Avatar
        name={company.name}
        shape="rounded"
        size="md"
        source={company.logoUrl ? { uri: company.logoUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
          {company.name}
        </Text>
        <Text className="text-caption-lg text-fg-2">{`Đã chặn ${formatDate(blocked.blockedAt)}`}</Text>
      </View>
      <Button
        accessibilityLabel={`Bỏ chặn ${company.name}`}
        disabled={disabled}
        label="Bỏ chặn"
        size="sm"
        variant="secondary"
        onPress={() => onUnblock(blocked)}
      />
    </View>
  );
}
