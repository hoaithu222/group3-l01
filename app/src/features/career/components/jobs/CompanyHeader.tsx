import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Icon } from '@/shared/ui/icon';

import type { CompanyBrief } from '../../api/recruiter.types';
import { COMPANY_STATUS_LABEL } from '../../constants/recruiter.constants';

/**
 * Đầu chi tiết lời mời (app.md §2 `CompanyHeader`): logo, tên, nhãn "Đã xác minh" / "Tạm ngưng". Website và quy mô KHÔNG có ở đây — BE chỉ trả
 * `{ id, name, logoUrl, status }` cho sinh viên (`CompanyBrief`), không lộ MST/mô tả nội bộ. Nhãn có icon + chữ (không chỉ màu).
 */
export function CompanyHeader({ company }: { company: CompanyBrief }) {
  const verified = company.status === 'APPROVED';
  return (
    <View className="flex-row items-center gap-sm">
      <Avatar
        name={company.name}
        shape="rounded"
        size="lg"
        source={company.logoUrl ? { uri: company.logoUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <Text
          accessibilityRole="header"
          className="text-header-sm font-semibold text-fg-1"
          numberOfLines={2}
        >
          {company.name}
        </Text>
        <View className="flex-row items-center gap-2xs">
          <Icon
            color={verified ? 'success' : 'warning'}
            name={verified ? 'checkmark-circle' : 'alert-warning'}
            size="sm"
          />
          <Text className="flex-1 text-caption-lg text-fg-2">
            {COMPANY_STATUS_LABEL[company.status]}
          </Text>
        </View>
      </View>
    </View>
  );
}
