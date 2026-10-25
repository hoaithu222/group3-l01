import type { ChatScopeInput, ReminderTab, ScheduledTab } from './chat-extensions.types';

/**
 * Khoá cache của `chat-extensions`. Đưa MỌI tham số ảnh hưởng kết quả vào khoá (`api-data`): thiếu `scopeId` thì đổi phòng mà số "N tin đã hẹn" không đổi.
 * ⚠️ KHÔNG có khoá `poll.detail`: thẻ khảo sát đọc `message.poll` trong cache TIN NHẮN của `chat` (`chatKeys.messages`) — một nguồn duy nhất, không hai bản lệch nhau.
 */
export const pollKeys = {
  /** Tiền tố của mọi tab người bầu của MỘT khảo sát — để `invalidate` khi số phiếu đổi. */
  votersOf: (pollId: string) => ['chat-ext', 'poll', pollId, 'voters'] as const,
  voters: (pollId: string, optionId: string) => ['chat-ext', 'poll', pollId, 'voters', optionId] as const,
};

export const scheduledKeys = {
  all: ['chat-ext', 'scheduled'] as const,
  /** `scope` vắng = mọi phòng ("Tin đã hẹn" mở từ màn Tôi); có = lọc theo phòng (mở từ banner trên ô soạn). */
  mine: (tab: ScheduledTab, scope?: Pick<ChatScopeInput, 'scopeType' | 'scopeId'>) =>
    ['chat-ext', 'scheduled', 'mine', tab, scope?.scopeType ?? null, scope?.scopeId ?? null] as const,
  /** Số tin ĐANG CHỜ của MỘT phòng chat (banner trên ô soạn). */
  count: (scope: Pick<ChatScopeInput, 'scopeType' | 'scopeId'>) =>
    ['chat-ext', 'scheduled', 'count', scope.scopeType, scope.scopeId] as const,
};

export const reminderKeys = {
  all: ['chat-ext', 'reminders'] as const,
  mine: (tab: ReminderTab) => ['chat-ext', 'reminders', 'mine', tab] as const,
};

export const conversionKeys = {
  workspaces: ['chat-ext', 'convert', 'workspaces'] as const,
  boards: (workspaceId: string) => ['chat-ext', 'convert', 'boards', workspaceId] as const,
};
