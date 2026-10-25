import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button, LinkButton } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { formatDateTime } from '@/shared/utils/format/date.utils';

import type { MentorApplication } from '../api/mentor.types';
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_VARIANT } from '../constants/mentor.constants';

export interface ApplicationCardProps {
  application: MentorApplication;
  /** Khoá hai nút khi bài đã đủ cố vấn (vẫn xem được đơn) hoặc đang gửi. */
  acceptDisabled?: boolean;
  busy?: boolean;
  /** Khe tuỳ chọn cho thẻ huy hiệu kỹ năng (p6-06, khi cờ `career` bật) — chưa nối, để trống. */
  badges?: ReactNode;
  onAccept: (application: MentorApplication) => void;
  onReject: (application: MentorApplication) => void;
}

/**
 * Hồ sơ tóm tắt người ứng tuyển (app.md §3 `ApplicationCard`): tên, lời nhắn, link hồ sơ (CHỈ `https`, mở bằng `WebBrowser`
 * — không mở `http:`/`javascript:`), trạng thái bằng chữ. KHÔNG hiện email. Nút Chấp nhận/Từ chối chỉ khi đơn đang chờ.
 */
export function ApplicationCard({
  acceptDisabled,
  application,
  badges,
  busy,
  onAccept,
  onReject,
}: ApplicationCardProps) {
  const pending = application.status === 'PENDING';
  const url = application.portfolioUrl?.startsWith('https://') ? application.portfolioUrl : null;

  return (
    <Card>
      <View className="gap-sm">
        <View className="flex-row items-center gap-sm">
          {/* Ảnh người ứng tuyển (`applicant.avatarUrl`) khi BE có — hiện tại luôn `null` nên chữ viết tắt đỡ lấy. */}
          <Avatar
            name={application.applicant.name}
            size="md"
            source={application.applicant.avatarUrl ? { uri: application.applicant.avatarUrl } : undefined}
          />
          <View className="flex-1 gap-3xs">
            <Text className="text-label-lg font-semibold text-fg-1">
              {application.applicant.name}
            </Text>
            <Text className="text-caption-sm text-fg-2">
              Gửi {formatDateTime(application.createdAt)}
            </Text>
          </View>
          <Badge
            label={APPLICATION_STATUS_LABEL[application.status]}
            size="sm"
            variant={APPLICATION_STATUS_VARIANT[application.status]}
          />
        </View>
        {badges}
        {/* Lời nhắn trong khối nền nhạt có icon bong bóng chat — tách "lời của người ứng tuyển" khỏi phần thông tin của thẻ. */}
        <View className="flex-row gap-xs rounded-sm bg-bg-2 p-sm">
          <Icon color="fg-2" name="chat-bubble" size={16} />
          <Text className="flex-1 text-body-md text-fg-1">{application.message}</Text>
        </View>
        {url ? (
          <LinkButton
            iconLeft="link"
            label="Mở link hồ sơ"
            size="sm"
            onPress={() => void WebBrowser.openBrowserAsync(url)}
          />
        ) : null}
        {application.rejectReason ? (
          <Text className="text-caption-lg text-fg-2">Lý do: {application.rejectReason}</Text>
        ) : null}
        {pending ? (
          <View className="flex-row gap-sm">
            <View className="flex-1">
              <Button
                disabled={busy}
                fullWidth
                iconLeft="cancel"
                label="Từ chối"
                variant="secondary"
                onPress={() => onReject(application)}
              />
            </View>
            <View className="flex-1">
              <Button
                disabled={acceptDisabled || busy}
                fullWidth
                iconLeft="checkmark-circle"
                label="Chấp nhận"
                onPress={() => onAccept(application)}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
