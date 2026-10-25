import { Text, View } from 'react-native';

import { scopeKeyOf, useConnectionState } from '@/core/socket';
import type { MessageBodyProps } from '@/shared/message-extensions';
import { hapticSelection } from '@/shared/utils/haptics';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useClosePoll } from '../../hooks/useClosePoll';
import { usePollClosed } from '../../hooks/usePollClosed';
import { usePollVote } from '../../hooks/usePollVote';
import { useChatExtIntentStore } from '../../store/chat-ext-intent.store';
import { describeChatExtError } from '../../utils/error-info';
import { formatDeadline } from '../../utils/local-time';
import { PollFooter } from './PollFooter';
import { PollOptionRow } from './PollOptionRow';

/** Nhãn dòng thông tin: "Chọn một · Ẩn danh · Kết thúc 20:00 21/09" hoặc "… · Đã kết thúc". */
function metaLabel(poll: NonNullable<MessageBodyProps['message']['poll']>, closed: boolean): string {
  const parts = [poll.multi ? 'Chọn nhiều' : 'Chọn một'];
  if (poll.anonymous) parts.push('Ẩn danh');
  if (closed) parts.push('Đã kết thúc');
  else if (poll.closesAt) parts.push(`Kết thúc ${formatDeadline(poll.closesAt)}`);
  return parts.join(' · ');
}

/**
 * Thẻ khảo sát trong bong bóng (`kind = 'POLL'`, p7-04 app.md §3 `PollCard`): câu hỏi, dòng thông tin, các lựa chọn (thanh tiến độ + số phiếu + %), "N người đã bầu", "Xem người bầu",
 * "Kết thúc khảo sát". Đọc `message.poll` THẲNG từ cache tin nhắn (bầu lạc quan/`poll:updated` vá ở đó — một nguồn duy nhất).
 *
 * Quyền hiển thị SUY THÊM ở client vì `poll` đến qua socket là bản DÙNG CHUNG (`canClose`/`canViewVoters` luôn `false`, `myOptionIds` rỗng): người tạo và moderator được
 * "Kết thúc"; người xem được "Xem người bầu" khi KHÔNG ẩn danh. Server vẫn là chốt chặn thật (403 `AUTH_005`/`POLL_006`).
 *
 * Ngoại tuyến hoặc đã kết thúc ⇒ khoá lựa chọn nhưng vẫn đọc được kết quả. `POLL_005`/404 khi bầu ⇒ thẻ đổi sang "Khảo sát không còn khả dụng" (mất quyền kênh, tin bị gỡ).
 */
export function PollCard({ message, scope }: MessageBodyProps) {
  const poll = message.poll;
  if (!poll) return null;
  // `key = poll.id`: FlashList TÁI DÙNG ô giữa các tin — không có key thì state của mutation bầu (`isError`/`error`) và hộp thoại xác nhận của khảo sát trước rò sang khảo sát sau.
  return <PollCardBody key={poll.id} authorId={message.authorId} canModerate={message.myPermissions?.canModerate === true} poll={poll} scope={scope} />;
}

interface PollCardBodyProps {
  poll: NonNullable<MessageBodyProps['message']['poll']>;
  authorId: string | null;
  canModerate: boolean;
  scope: MessageBodyProps['scope'];
}

function PollCardBody({ poll, authorId, canModerate, scope }: PollCardBodyProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  // `offline` = máy mất mạng (NetInfo xác nhận). `connecting` (socket đang nối lại, mạng còn) KHÔNG khoá: bầu đi qua HTTP, không cần socket.
  const offline = useConnectionState() === 'offline';
  const closed = usePollClosed(poll);
  const vote = usePollVote(scope, poll);
  const close = useClosePoll(scope, poll);
  const openIntent = useChatExtIntentStore((state) => state.open);

  if (vote.isError && describeChatExtError(vote.error).gone) {
    return <Text className="text-body-md text-fg-2">Khảo sát không còn khả dụng</Text>;
  }

  const locked = closed || offline;
  const toggle = (optionId: string) => {
    if (locked) return;
    hapticSelection(); // chọn/bỏ một đáp án = đổi lựa chọn — rung TRƯỚC `mutate` (bầu lạc quan, thanh % đổi ngay sau đó)
    const mine = poll.myOptionIds;
    let next: string[];
    if (poll.multi) next = mine.includes(optionId) ? mine.filter((id) => id !== optionId) : [...mine, optionId];
    else next = mine.length === 1 && mine[0] === optionId ? [] : [optionId];
    vote.mutate({ nextIds: next });
  };

  const isCreator = authorId !== null && authorId === currentUserId;
  const canClose = !closed && (poll.canClose || isCreator || canModerate);
  const viewVoters = () => {
    const firstWithVotes = poll.options.find((o) => o.voteCount > 0) ?? poll.options[0];
    if (!firstWithVotes) return;
    openIntent(scopeKeyOf(scope.scopeType, scope.scopeId, scope.threadId), {
      kind: 'voters',
      pollId: poll.id,
      question: poll.question,
      options: poll.options.map(({ id, text }) => ({ id, text })),
      optionId: firstWithVotes.id,
    });
  };

  return (
    <View className="min-w-60 gap-xs">
      <Text className="text-label-lg font-semibold text-fg-1">{poll.question}</Text>
      <Text className="text-caption-sm text-fg-2">
        {metaLabel(poll, closed)}
        {!closed && offline ? ' · Ngoại tuyến' : ''}
      </Text>
      <View accessibilityRole={poll.multi ? undefined : 'radiogroup'} className="gap-xs">
        {poll.options.map((option) => (
          <PollOptionRow
            key={option.id}
            disabled={locked}
            multi={poll.multi}
            option={option}
            selected={poll.myOptionIds.includes(option.id)}
            onPress={toggle}
          />
        ))}
      </View>
      <PollFooter
        canClose={canClose}
        canViewVoters={!poll.anonymous && poll.voterCount > 0}
        closing={close.isPending}
        voterCount={poll.voterCount}
        onClose={() => close.mutate()}
        onViewVoters={viewVoters}
      />
    </View>
  );
}
