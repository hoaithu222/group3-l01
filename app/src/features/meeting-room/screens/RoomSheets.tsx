import { useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingRoomService } from '../api/meeting-room.service';
import type { RoomRole } from '../api/meeting-room.types';
import { MeetingChatSheet } from '../components/chat/MeetingChatSheet';
import { MoreActionsSheet } from '../components/controls/MoreActionsSheet';
import { ReactionsPicker } from '../components/controls/ReactionsPicker';
import { ConfirmHostActionDialog } from '../components/dialogs/ConfirmHostActionDialog';
import { LeaveMeetingDialog } from '../components/dialogs/LeaveMeetingDialog';
import { HostParticipantMenu } from '../components/people/HostParticipantMenu';
import { ParticipantsSheet } from '../components/people/ParticipantsSheet';
import { toggleHand } from '../hooks/meeting-room.hand';
import { endMeetingForAll, leaveMeeting } from '../hooks/meeting-room.leave';
import { navigateOutOfRoom } from '../hooks/useExitMeetingRoom';
import type { MeetingControls } from '../hooks/useMeetingControls';
import type { MeetingHostControls } from '../hooks/useMeetingHostControls';
import type { MeetingReactions } from '../hooks/useMeetingReactions';
import { useRaisedHandAlerts } from '../hooks/useRaisedHandAlerts';
import type { RecordingControls } from '../hooks/useRecordingControls';
import type { RoomDialogs } from '../hooks/useRoomDialogs';
import { useMeetingAttendees } from '../queries/meeting-room.queries';
import { meetingRoomApi, useMeetingRoomStore } from '../store/meeting-room.store';
import { hostActionMessage } from '../utils/meeting-room-errors';
import { groupForPanel, type RoomPerson } from '../utils/room-people.utils';
import { confirmCopy } from './room-confirm';

/** Dòng phụ của mục "Ghi hình" — trạng thái bằng chữ. */
const recordStatusText = ({ active, recording }: RecordingControls): string =>
  active ? (recording?.status === 'STOPPING' ? 'Đang dừng ghi…' : 'Đang ghi hình') : recording?.status === 'CONSENT_REQUESTED' ? 'Đang chờ mọi người đồng ý' : 'Hỏi ý kiến mọi người trước khi ghi';

export interface RoomSheetsProps {
  controls: MeetingControls;
  dialogs: RoomDialogs;
  host: MeetingHostControls;
  meId: string;
  meetingId: string;
  /** Mọi người trong phòng (đã ghép media + server, đã sắp). */
  people: RoomPerson[];
  reactions: MeetingReactions;
  /** p2-06: mục "Ghi hình" trong "Thêm" (chỉ khi `canControl`). */
  recording: RecordingControls;
  role: RoomRole;
}

/**
 * Mọi sheet/hộp thoại của phòng (Người tham gia, menu chủ trì, Thêm, Cảm xúc, Chat, Rời, xác nhận). Chỉ nối component thuần với hook —
 * việc cần xác nhận lần hai (mời ra, tắt mic tất cả, kết thúc cho mọi người) đi qua `ConfirmHostActionDialog` rồi mới gọi server.
 */
export function RoomSheets({ controls, dialogs, host, meId, meetingId, people, reactions, recording, role }: RoomSheetsProps) {
  const sheet = useMeetingRoomStore((state) => state.sheet);
  const busy = useMeetingRoomStore((state) => state.busy);
  const layout = useMeetingRoomStore((state) => state.layout);
  const conversationId = useMeetingRoomStore((state) => state.conversationId);
  const canEnd = useMeetingRoomStore((state) => state.brief?.myActions.canEnd);
  const [creatingChat, setCreatingChat] = useState(false);
  const attendees = useMeetingAttendees(meetingId, sheet === 'PARTICIPANTS').data;
  // Chủ trì/đồng chủ trì: báo khi người khác giơ tay (gom theo lô, không báo tay đã giơ từ trước lúc mình vào/nối lại).
  useRaisedHandAlerts(people, role);

  const inRoom = new Set(people.map((person) => person.userId));
  const invited = (attendees ?? []).filter((attendee) => !inRoom.has(attendee.userId));
  const menuPerson = people.find((person) => person.userId === dialogs.menuUserId) ?? null;
  const confirm = dialogs.confirm;
  const copy = confirmCopy(confirm);
  /** Menu chủ trì luôn nói về MỘT người; người đó vừa rời phòng thì `menuPerson` là `null` và các lệnh trở thành no-op. */
  const onMenuPerson = (action: (userId: string) => void) => () => menuPerson && action(menuPerson.userId);
  /** "Hạ tay" trên một hàng: của MÌNH = tự hạ (chỉ khi còn đang giơ — bấm hai lần không giơ lại), người khác = thao tác chủ trì. */
  const lowerHand = (person: RoomPerson): void => {
    if (!person.isLocal) host.lowerHand(person.userId);
    else if (meetingRoomApi.get().handRaisedAt) void toggleHand();
  };

  const createChat = async (): Promise<void> => {
    setCreatingChat(true);
    try {
      const created = await meetingRoomService.ensureChatGroup(meetingId);
      meetingRoomApi.patch({ conversationId: created.conversationId });
    } catch (error) {
      showToast('error', hostActionMessage(error));
    } finally {
      setCreatingChat(false);
    }
  };

  const leave = async (transferTo?: string): Promise<void> => {
    await leaveMeeting(transferTo);
    navigateOutOfRoom(meetingId);
  };

  const runConfirmed = (): void => {
    if (!confirm) return;
    dialogs.dismissConfirm();
    if (confirm.kind === 'END_ALL') void endMeetingForAll();
    else if (confirm.kind === 'MUTE_ALL') host.muteAll();
    else host.removeParticipant(confirm.userId, confirm.alsoRemoveAttendee);
  };

  return (
    <>
      <ParticipantsSheet
        admitAllPending={host.bulkPending}
        groups={groupForPanel(people)}
        invited={invited}
        lobby={host.lobby}
        lowerAllPending={host.lowerAllPending}
        loweringUserId={host.loweringUserId}
        meId={meId}
        meRole={role}
        pendingLobbyUserIds={host.pendingUserIds}
        visible={sheet === 'PARTICIPANTS'}
        onAdmit={host.admit}
        onAdmitAll={host.admitAll}
        onClose={controls.closeSheet}
        onDeny={host.deny}
        onLowerAllHands={host.lowerAllHands}
        onLowerHand={lowerHand}
        onOpenPersonMenu={(person) => dialogs.openMenu(person.userId)}
      />
      <HostParticipantMenu
        canChangeRole={menuPerson ? host.canChangeRole(menuPerson.userId) : false}
        meRole={role}
        person={menuPerson}
        onClose={dialogs.closeMenu}
        onLowerHand={onMenuPerson(host.lowerHand)}
        onMuteCamera={onMenuPerson((userId) => host.mute(userId, 'CAMERA'))}
        onMuteMic={onMenuPerson((userId) => host.mute(userId, 'MICROPHONE'))}
        onRemove={(alsoRemoveAttendee) => {
          if (menuPerson) dialogs.askConfirm({ alsoRemoveAttendee, kind: 'REMOVE', name: menuPerson.name, userId: menuPerson.userId });
          dialogs.closeMenu();
        }}
        onSetRole={(next) => onMenuPerson((userId) => host.setRole(userId, next))()}
        onStopShare={onMenuPerson((userId) => host.mute(userId, 'SCREEN_SHARE'))}
      />
      <MoreActionsSheet
        canEndForAll={canEnd ?? host.hostLike}
        canScreenShare={controls.canScreenShare}
        layout={layout}
        locked={host.lockedAt !== null}
        raisedHands={people.filter((person) => person.handRaisedAt).length}
        recordStatus={recordStatusText(recording)}
        role={role}
        screenSharing={controls.screenSharing}
        speakerOn={controls.speakerOn}
        visible={sheet === 'MORE'}
        onChangeLayout={controls.setLayout}
        onClose={controls.closeSheet}
        onEndForAll={() => dialogs.askConfirm({ kind: 'END_ALL' })}
        onFlipCamera={() => void controls.flipCamera()}
        onLowerAllHands={host.lowerAllHands}
        onMuteAll={() => dialogs.askConfirm({ kind: 'MUTE_ALL' })}
        onRecord={recording.canControl ? recording.openSheet : undefined}
        onToggleLock={host.toggleLock}
        onToggleScreenShare={() => void controls.toggleScreenShare()}
        onToggleSpeaker={() => void controls.toggleSpeaker()}
      />
      <ReactionsPicker visible={sheet === 'REACTIONS'} onClose={controls.closeSheet} onPick={(emoji) => void reactions.send(emoji)} />
      <MeetingChatSheet
        canCreate={host.hostLike}
        conversationId={conversationId}
        creating={creatingChat}
        meetingId={meetingId}
        visible={sheet === 'CHAT'}
        onClose={controls.closeSheet}
        onCreate={() => void createChat()}
      />
      <LeaveMeetingDialog
        busy={busy}
        candidates={people.filter((person) => !person.isLocal && person.role === 'MEMBER')}
        hostLike={host.hostLike}
        visible={dialogs.leaveOpen}
        onClose={dialogs.closeLeave}
        onEndForAll={() => {
          dialogs.closeLeave();
          void endMeetingForAll();
        }}
        onLeave={() => void leave()}
        onLeaveAndTransfer={(userId) => void leave(userId)}
      />
      <ConfirmHostActionDialog
        confirmLabel={copy.confirmLabel}
        danger={copy.danger}
        description={copy.description}
        loading={busy || host.bulkPending}
        title={copy.title}
        visible={confirm !== null}
        onCancel={dialogs.dismissConfirm}
        onConfirm={runConfirmed}
      />
    </>
  );
}
