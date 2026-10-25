import { useEffect } from 'react';

import { scopeKeyOf } from '@/core/socket';
import type { ChatRoomHostProps } from '@/shared/message-extensions';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';
import { usePollSocket } from '../../hooks/usePollSocket';
import { useScheduledSocket } from '../../hooks/useScheduledMessages';
import { useChatExtIntentStore } from '../../store/chat-ext-intent.store';
import { ConvertToTaskSheet } from '../convert/ConvertToTaskSheet';
import { SaveToResourceSheet } from '../convert/SaveToResourceSheet';
import { CreatePollSheet } from '../poll/CreatePollSheet';
import { PollVotersSheet } from '../poll/PollVotersSheet';
import { RemindMeSheet } from '../reminder/RemindMeSheet';
import { ScheduleSendSheet } from '../schedule/ScheduleSendSheet';

interface SubHostProps {
  scope: ChatRoomHostProps['scope'];
  scopeKey: string;
}

/** Ý định thuộc phòng NÀY (và còn đang mở) — hai phòng chat cùng mở (vd khung chat phòng họp) không dựng nhầm tấm của nhau. */
function useMyIntent(scopeKey: string) {
  const intent = useChatExtIntentStore((state) => state.intent);
  const visible = useChatExtIntentStore((state) => state.visible);
  const session = useChatExtIntentStore((state) => state.session);
  const close = useChatExtIntentStore((state) => state.close);
  const mine = intent?.scopeKey === scopeKey ? intent : null;
  return { mine, visible: visible && mine !== null, session, close };
}

function PollHost({ scope, scopeKey }: SubHostProps) {
  usePollSocket(scope);
  const { mine, visible, session, close } = useMyIntent(scopeKey);
  return (
    <>
      <CreatePollSheet key={`poll-${session}`} scope={scope} visible={visible && mine?.kind === 'poll'} onClose={close} />
      <PollVotersSheet target={mine?.kind === 'voters' ? mine : null} visible={visible && mine?.kind === 'voters'} onClose={close} />
    </>
  );
}

function ScheduleHost({ scope, scopeKey }: SubHostProps) {
  useScheduledSocket();
  const { mine, visible, session, close } = useMyIntent(scopeKey);
  if (mine?.kind !== 'schedule') return null;
  return <ScheduleSendSheet key={`schedule-${session}`} draft={mine.draft} scope={scope} visible={visible} onClose={close} />;
}

function RemindHost({ scopeKey }: Pick<SubHostProps, 'scopeKey'>) {
  const { mine, visible, session, close } = useMyIntent(scopeKey);
  return (
    <RemindMeSheet
      key={`remind-${session}`}
      messageId={mine?.kind === 'remind' ? mine.messageId : null}
      visible={visible && mine?.kind === 'remind'}
      onClose={close}
    />
  );
}

function TaskHost({ scope, scopeKey }: SubHostProps) {
  const { mine, visible, session, close } = useMyIntent(scopeKey);
  return (
    <ConvertToTaskSheet
      key={`task-${session}`}
      scope={scope}
      source={mine?.kind === 'task' ? mine : null}
      visible={visible && mine?.kind === 'task'}
      onClose={close}
    />
  );
}

function ResourceHost({ scope, scopeKey }: SubHostProps) {
  const { mine, visible, session, close } = useMyIntent(scopeKey);
  return (
    <SaveToResourceSheet
      key={`resource-${session}`}
      scope={scope}
      source={mine?.kind === 'resource' ? mine : null}
      visible={visible && mine?.kind === 'resource'}
      onClose={close}
    />
  );
}

/**
 * MỘT lần mỗi phòng chat (khe `roomHost` của `chat`, p7-04): nghe realtime (`poll:updated`, `scheduled-message:updated`) và dựng các tấm mà menu "+"/menu tin/thẻ khảo sát "yêu cầu" qua
 * store — Khảo sát, Người bầu, Hẹn giờ gửi, Nhắc lại, Tạo task, Lưu vào tài liệu. Mỗi nhóm chỉ dựng khi cờ phụ của nó BẬT (cờ tắt hoặc chưa biết ⇒ không nghe, không dựng gì — DU-05).
 * Rời phòng mà ý định còn treo ⇒ quên hẳn (giữ nháp/tin đích của phòng đã rời là rò dữ liệu; lần vào phòng sau tự có ý định mới).
 */
export function ChatExtHost({ scope }: ChatRoomHostProps) {
  const features = useChatSubFeatures();
  const scopeKey = scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId);

  useEffect(
    () => () => {
      const store = useChatExtIntentStore.getState();
      if (store.intent?.scopeKey === scopeKey) store.reset();
    },
    [scopeKey],
  );

  // Nhắc lại theo `messageId` (không phụ thuộc phòng) nên `RemindHost` không cần `scope`; các nhóm còn lại dùng `scope` cho khoá cache tin nhắn của phòng.
  return (
    <>
      {features.polls ? <PollHost scope={scope} scopeKey={scopeKey} /> : null}
      {features.scheduledMessages ? <ScheduleHost scope={scope} scopeKey={scopeKey} /> : null}
      {features.messageReminders ? <RemindHost scopeKey={scopeKey} /> : null}
      {features.messageToTask ? <TaskHost scope={scope} scopeKey={scopeKey} /> : null}
      {features.messageToResource ? <ResourceHost scope={scope} scopeKey={scopeKey} /> : null}
    </>
  );
}
