import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { classifyContactInput } from '@/shared/utils/contact.utils';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { MemberLookupItem } from '../api';
import { MemberLookupRow } from '../components/MemberLookupRow';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useWorkspaceAccess } from '../queries/guests.queries';
import { useAddMember, useMemberLookup } from '../queries/member-add.queries';
import { addMemberErrorMessage, lookupErrorMessage } from '../utils/member-add-errors';

/** Trễ trước khi tra: người dùng gõ xong email/SĐT mới gọi, không bắn lượt cho từng biến thể dở dang (hạn mức 30 lượt/10 phút). */
const LOOKUP_DEBOUNCE_MS = 600;

/**
 * Thêm thành viên bằng SĐT hoặc email (route `members/add`, OWNER/ADMIN).
 *
 * Đường thay cho lời mời email khi người nhận CHƯA xác minh email (app chưa có màn xác minh nên `INV_008`) hoặc khi chỉ biết số điện
 * thoại: tra khớp CHÍNH XÁC → hiện tên + gợi ý che → bấm "Thêm" là vào nhóm ngay (người được thêm nhận thông báo hộp thư).
 * Chỉ tra khi ô đã là email đầy đủ/SĐT hợp lệ — tên hay số dở dang không tìm được (BE cố ý chặn để không thành công cụ dò danh bạ).
 * Màn không tự suy quyền: nút vào chỉ hiện cho OWNER/ADMIN, còn 403/404 của BE mới là hàng rào thật.
 */
export function AddMemberByContactScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const isOffline = useConnectionState() === 'offline';
  const { data: access } = useWorkspaceAccess(wsId);

  const [text, setText] = useState('');
  const debounced = useDebouncedValue(text, LOOKUP_DEBOUNCE_MS);
  const contact = useMemo(() => classifyContactInput(debounced), [debounced]);
  const typing = classifyContactInput(text);

  const lookup = useMemberLookup(wsId, contact);
  const addMember = useAddMember(wsId);

  function handleAdd(item: MemberLookupItem): void {
    addMember.mutate(item.userId, {
      onSuccess: (result) => {
        if (result.state === 'ADDED') hapticSuccess(); // chỉ khi THỰC SỰ vừa thêm — "đã ở trong nhóm" không phải việc vừa xong
        showToast('success', result.state === 'ADDED' ? `Đã thêm ${item.name} vào nhóm.` : `${item.name} đã ở trong nhóm.`);
      },
      onError: (error) => showToast('error', addMemberErrorMessage(error)),
    });
  }

  const hasText = text.trim().length > 0;
  const waiting = typing.kind !== 'INCOMPLETE' && (typing.value !== contact.value || lookup.isFetching);
  const items = lookup.data ?? [];

  return (
    <Screen header={<AppBar title="Thêm thành viên" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        <Input
          autoCapitalize="none"
          autoCorrect={false}
          clearable
          clearLabel="Xoá email hoặc số điện thoại"
          label="Email hoặc số điện thoại"
          message={hasText && typing.kind === 'INCOMPLETE' ? 'Nhập đầy đủ email hoặc số điện thoại để tìm.' : undefined}
          messageTone="hint"
          placeholder="ban@congty.vn hoặc 0912 345 678"
          returnKeyType="search"
          onChangeText={setText}
        />

        {!hasText ? (
          <Text className="text-body-md text-fg-2">
            Chỉ tìm được khi nhập ĐÚNG và ĐỦ email hoặc số điện thoại mà người đó dùng trên Super App, và họ cho phép tìm thấy. Người được
            thêm sẽ vào nhóm ngay và nhận thông báo.
          </Text>
        ) : null}

        {waiting || (lookup.isLoading && contact.kind !== 'INCOMPLETE') ? (
          // Cùng hình một dòng kết quả (avatar + tên + dòng khớp), cùng lề với `MemberLookupRow`.
          <SkeletonParagraphWithIcon className="py-sm" />
        ) : lookup.isError ? (
          <Alert description={lookupErrorMessage(lookup.error)} title="Không tra được" tone="error" />
        ) : contact.kind !== 'INCOMPLETE' && typing.kind !== 'INCOMPLETE' && lookup.isSuccess ? (
          items.length === 0 ? (
            <EmptyState
              actions={
                contact.kind === 'EMAIL' && access?.canInviteByEmail
                  ? [{ label: 'Mời qua email', onPress: () => router.push({ pathname: '/workspaces/[wsId]/members/invite-email', params: { wsId } }) }]
                  : undefined
              }
              description="Chưa có ai đăng ký với thông tin này, hoặc họ không cho tìm thấy bằng email/số điện thoại."
              icon="search"
              title="Không tìm thấy tài khoản"
              tone="neutral"
            />
          ) : (
            // `-mx-md`: hàng đã tự có `px-md`; `Screen` (padded) cộng thêm 16 nữa sẽ thụt chữ vào 32dp.
            <View className="-mx-md">
              {items.map((item) => (
                <MemberLookupRow
                  key={item.userId}
                  adding={addMember.isPending && addMember.variables === item.userId}
                  disabled={isOffline || addMember.isPending}
                  item={item}
                  onAdd={handleAdd}
                />
              ))}
            </View>
          )
        ) : null}
      </View>
    </Screen>
  );
}
