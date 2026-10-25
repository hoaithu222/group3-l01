import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button, LinkButton } from '@/shared/ui/button';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { JoinRequestRow as JoinRequestRowData } from '../api';

/** Gập lời nhắn ở 4 dòng; ~40 ký tự/dòng trên điện thoại ⇒ quá 160 ký tự (hoặc quá 4 dòng xuống dòng thật) thì có "Xem thêm". */
const MESSAGE_COLLAPSE_LINES = 4;
const MESSAGE_COLLAPSE_CHARS = MESSAGE_COLLAPSE_LINES * 40;

export interface JoinRequestRowProps {
  /** Offline: chỉ đọc (app.md p3-04 §3). */
  disabled?: boolean;
  onApprove: (request: JoinRequestRowData) => void;
  onReject: (request: JoinRequestRowData) => void;
  request: JoinRequestRowData;
}

/**
 * Một yêu cầu tham gia (app.md p3-04 §2): ảnh, tên, lời nhắn, thời gian, và
 * Duyệt · Từ chối. Từ chối mở sheet lý do (tuỳ chọn) ở màn cha — dòng này chỉ
 * báo "muốn từ chối", không tự gọi API.
 *
 * Lời nhắn (`requestMessage`, người xin gõ ở màn xem trước lời mời, ≤ 500 ký tự) là văn bản của NGƯỜI LẠ: vẽ bằng `<Text>` thuần
 * (không Markdown/HTML). Gập ở 4 dòng có "Xem thêm" — quản trị viên cần đọc HẾT trước khi duyệt, nên không cắt cụt vô điều kiện.
 */
export function JoinRequestRow({ disabled = false, onApprove, onReject, request }: JoinRequestRowProps) {
  const { user } = request;
  const [expanded, setExpanded] = useState(false);
  const message = request.requestMessage;
  const long =
    message !== null &&
    (message.length > MESSAGE_COLLAPSE_CHARS || message.split('\n').length > MESSAGE_COLLAPSE_LINES);

  return (
    <View className="gap-sm border-b border-b-divider-1 px-md py-sm">
      <View className="flex-row items-center gap-sm">
        <Avatar name={user.name} size="md" source={user.avatarUrl ? { uri: user.avatarUrl } : undefined} />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md text-fg-1" numberOfLines={1}>
            {user.name}
          </Text>
          <Text className="text-caption-sm text-fg-2">Xin vào {formatRelative(request.requestedAt)}</Text>
        </View>
      </View>

      {message ? (
        <View className="items-start gap-3xs">
          <Text
            accessibilityLabel={`Lời nhắn của ${user.name}: ${message}`}
            className="text-body-md text-fg-2"
            numberOfLines={long && !expanded ? MESSAGE_COLLAPSE_LINES : undefined}
          >
            {message}
          </Text>
          {long ? (
            <LinkButton
              accessibilityLabel={expanded ? `Thu gọn lời nhắn của ${user.name}` : `Xem thêm lời nhắn của ${user.name}`}
              label={expanded ? 'Thu gọn' : 'Xem thêm'}
              onPress={() => setExpanded((value) => !value)}
            />
          ) : null}
        </View>
      ) : null}

      <View className="flex-row justify-end gap-xs">
        <Button
          accessibilityLabel={`Từ chối yêu cầu của ${user.name}`}
          disabled={disabled}
          label="Từ chối"
          size="sm"
          variant="neutral-secondary"
          onPress={() => onReject(request)}
        />
        <Button
          accessibilityLabel={`Duyệt yêu cầu của ${user.name}`}
          disabled={disabled}
          label="Duyệt"
          size="sm"
          onPress={() => onApprove(request)}
        />
      </View>
    </View>
  );
}
