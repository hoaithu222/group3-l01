import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { InviteJoinForm } from './InviteJoinForm';

export interface InviteJoinActionsProps {
  accepting: boolean;
  alreadyMember: boolean;
  isAuthenticated: boolean;
  /** `requestMessage`: lời nhắn cho quản trị viên (đã cắt khoảng trắng) hoặc `undefined` khi để trống. */
  onAccept: (requestMessage?: string) => void;
  onLogin: () => void;
  onRegister: () => void;
  workspaceId: string;
}

/**
 * Ba nhánh nút của `InviteLandingScreen` (app.md p1-02 §3):
 *  · chưa đăng nhập  → "Đăng nhập để tham gia" / "Tạo tài khoản" (lưu `pendingInvite`);
 *  · đã đăng nhập, đã là thành viên → "Bạn đã ở trong nhóm" + "Mở nhóm";
 *  · đã đăng nhập, chưa phải thành viên → ô lời nhắn tuỳ chọn cho quản trị viên + "Tham gia" (`InviteJoinForm`).
 */
export function InviteJoinActions({
  accepting,
  alreadyMember,
  isAuthenticated,
  onAccept,
  onLogin,
  onRegister,
  workspaceId,
}: InviteJoinActionsProps) {
  if (!isAuthenticated) {
    return (
      <View className="gap-sm">
        <Button fullWidth label="Đăng nhập để tham gia" onPress={onLogin} />
        <Button fullWidth label="Tạo tài khoản" variant="secondary" onPress={onRegister} />
      </View>
    );
  }

  if (alreadyMember) {
    return (
      <View className="items-center gap-sm">
        <Text className="text-body-lg text-fg-2">Bạn đã ở trong nhóm này.</Text>
        <Button
          fullWidth
          label="Mở nhóm"
          onPress={() => router.replace({ pathname: '/workspaces/[wsId]', params: { wsId: workspaceId } })}
        />
      </View>
    );
  }

  return <InviteJoinForm accepting={accepting} onAccept={onAccept} />;
}
