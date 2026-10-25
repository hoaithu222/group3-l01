import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { SkillBadge } from '@/shared/career';
import { useFeature } from '@/shell/capabilities';

import type { MemberCard, MemberRow } from '../api';

/**
 * Đồ dùng chung cho test nhãn cố vấn (p6-03) + huy hiệu kỹ năng (p6-06) của `members`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.tsx`).
 * `jest.mock(...)` PHẢI nằm trong từng file test — babel-jest chỉ hoist chúng trong chính file đó. `enable` cần `@/shell/capabilities` đã được
 * mock ở file test gọi nó.
 */
export const DAY = 24 * 60 * 60 * 1000;

export const ROW: MemberRow = {
  avatarUrl: null,
  displayName: null,
  isMe: false,
  joinedAt: '2026-09-01T00:00:00.000Z',
  name: 'Lê Văn Cố',
  presence: 'OFFLINE',
  role: 'GUEST',
  status: 'ACTIVE',
  userId: 'u-mentor',
};

export const CARD: MemberCard = {
  ...ROW,
  actions: {
    canBan: false,
    canCall: false,
    canChangeRole: false,
    canMessage: false,
    canRemove: false,
  },
};

export function badge(id: string, name: string, over: Partial<SkillBadge> = {}): SkillBadge {
  return {
    proof: { avgPeerScore: 8, storyPoints: 10, tasksDone: 5 },
    revoked: false,
    revokedNotice: null,
    skill: { category: 'FRONTEND', code: id, description: null, icon: 'keyboard', id, name },
    unlockedAt: '2026-09-12T03:00:00.000Z',
    ...over,
  };
}

/** Bật đúng các cờ được nêu, tắt phần còn lại. */
export function enable(...flags: string[]): void {
  jest.mocked(useFeature).mockImplementation((flag: string) => flags.includes(flag));
}

export function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

export function providers(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
