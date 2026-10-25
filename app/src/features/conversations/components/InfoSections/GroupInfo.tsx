import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Reveal } from '@/shared/ui/motion';

import type { ConversationDetail } from '../../api/conversations.types';
import { useGroupMembers } from '../../hooks/useGroupMembers';
import { useMemberActions } from '../../hooks/useMemberActions';
import { usePatchConversation } from '../../hooks/usePatchConversation';
import { ConversationNotifySheet, currentNotifyLabel } from '../ConversationNotifySheet';
import { DissolveConfirmDialog } from '../DissolveConfirmDialog';
import { GroupSafetyRows } from '../GroupSafetyRows';
import { InfoActionRow } from '../InfoActionRow';
import { InfoGroup } from '../InfoGroup';
import { LeaveConfirmDialog } from '../LeaveConfirmDialog';
import { TransferOwnerSheet } from '../TransferOwnerSheet';
import { GroupInfoHero } from './GroupInfoHero';
import { GroupRenameSheet } from './GroupRenameSheet';
import { GroupSettingsSection } from './GroupSettingsSection';
import { SharedContentSection } from './SharedContentSection';

/** Số avatar thành viên xem trước ở đầu trang (lấy từ trang danh sách ĐÃ tải cho `TransferOwnerSheet`). */
const PREVIEW_MEMBERS = 5;

function openMembers(id: string): void {
  router.push({ pathname: '/messages/[conversationId]/members', params: { conversationId: id } });
}
function openAddMembers(id: string): void {
  router.push({
    pathname: '/messages/[conversationId]/add-members',
    params: { conversationId: id },
  });
}

/**
 * app.md §3 `ConversationInfoScreen` GROUP. "Nhóm của cuộc họp" ẩn Thêm/Xoá thành viên (p2-04 quản lý). Không có mục "Tin đã ghim" riêng —
 * đã có thanh ghim đầu phòng chat (`PinnedBar` do `ChatRoom` vẽ) và mục "Tin đã ghim" ở menu header.
 *
 * Bố cục (cùng nhịp màn Tôi): đầu trang → thẻ lối vào chính → `Section` có icon cho từng nhóm (nội dung đã chia sẻ · cài đặt · an toàn) →
 * thẻ phá huỷ đứng CUỐI, tách riêng. Khe 24 giữa các khối (`gap-xl`), `Section` tự lo khe 12 xuống thẻ.
 */
export function GroupInfo({ conversation }: { conversation: ConversationDetail }) {
  const patch = usePatchConversation(conversation.id);
  const memberActions = useMemberActions(conversation.id);
  const members = useGroupMembers(conversation.id);
  const [renameOpen, setRenameOpen] = useState(false);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [dissolveOpen, setDissolveOpen] = useState(false);

  const isMeeting = conversation.isMeetingGroup;
  const canManageSettings = conversation.myRole === 'OWNER' || conversation.myRole === 'ADMIN';
  const allMembers = members.data?.pages.flatMap((p) => p.data) ?? [];
  const otherMembers = allMembers.filter((m) => m.role !== 'OWNER');
  const previewMembers = allMembers
    .slice(0, PREVIEW_MEMBERS)
    .map((m) => ({ avatarUrl: m.avatarUrl, id: m.userId, name: m.name }));
  const { canDissolve, canLeave } = conversation.myPermissions;

  return (
    <View className="gap-xl py-xs">
      <Reveal kind="zoom">
        <GroupInfoHero
          conversation={conversation}
          previewMembers={previewMembers}
          onRename={() => setRenameOpen(true)}
        />
      </Reveal>

      <Reveal index={1}>
        <InfoGroup>
          {/* Icon KHÁC nhau: "Thành viên" (xem danh sách) và "Thêm thành viên" (hành động) từng cùng một icon `add-team` nên nhìn như một hàng lặp. */}
          <InfoActionRow
            icon="user"
            iconTone="info"
            label="Thành viên"
            value={String(conversation.memberCount)}
            onPress={() => openMembers(conversation.id)}
          />
          {!isMeeting && conversation.myPermissions.canAddMembers ? (
            <InfoActionRow
              icon="user-add"
              iconTone="success"
              label="Thêm thành viên"
              onPress={() => openAddMembers(conversation.id)}
            />
          ) : null}
          {/* Icon theo TRẠNG THÁI: chuông gạch khi đang tắt tiếng, chuông thường khi không — mô tả vẫn nói bằng chữ (không chỉ dựa vào hình). */}
          <InfoActionRow
            description={currentNotifyLabel(conversation)}
            icon={conversation.muted ? 'noti-off' : 'notification'}
            iconTone="warning"
            label="Thông báo"
            onPress={() => setMuteSheetOpen(true)}
          />
        </InfoGroup>
      </Reveal>

      <Reveal index={2}>
        <SharedContentSection conversationId={conversation.id} />
      </Reveal>

      {canManageSettings ? (
        <GroupSettingsSection
          conversation={conversation}
          onChange={(settings) => patch.mutate({ settings, expectedVersion: conversation.version })}
        />
      ) : null}

      <GroupSafetyRows conversation={conversation} />

      {/* Thao tác phá huỷ đứng CUỐI, trong thẻ riêng — tách khỏi lối vào thường dùng bằng khe 24 để khó bấm nhầm. */}
      {canLeave || canDissolve ? (
        <InfoGroup>
          {canLeave ? (
            <InfoActionRow
              icon="logout"
              label="Rời nhóm"
              tone="danger"
              onPress={() =>
                conversation.myRole === 'OWNER' ? setTransferOpen(true) : setLeaveOpen(true)
              }
            />
          ) : null}
          {canDissolve ? (
            <InfoActionRow
              icon="delete"
              label="Giải tán nhóm"
              tone="danger"
              onPress={() => setDissolveOpen(true)}
            />
          ) : null}
        </InfoGroup>
      ) : null}

      <GroupRenameSheet
        current={conversation.title ?? ''}
        visible={renameOpen}
        onClose={() => setRenameOpen(false)}
        onSave={(title) => {
          patch.mutate({ title, expectedVersion: conversation.version });
          setRenameOpen(false);
        }}
      />
      <ConversationNotifySheet
        conversation={conversation}
        visible={muteSheetOpen}
        onClose={() => setMuteSheetOpen(false)}
      />
      <LeaveConfirmDialog
        loading={memberActions.leave.isPending}
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => memberActions.leave.mutate()}
      />
      <TransferOwnerSheet
        loading={memberActions.transferOwner.isPending}
        members={otherMembers}
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={(toUserId) =>
          memberActions.transferOwner.mutate(toUserId, { onSuccess: () => setTransferOpen(false) })
        }
      />
      <DissolveConfirmDialog
        groupTitle={conversation.title ?? ''}
        loading={memberActions.dissolve.isPending}
        visible={dissolveOpen}
        onClose={() => setDissolveOpen(false)}
        onConfirm={(t) => memberActions.dissolve.mutate(t)}
      />
    </View>
  );
}
