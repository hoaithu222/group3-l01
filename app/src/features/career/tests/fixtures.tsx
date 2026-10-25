import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { SkillBadge, SkillCatalogItem, SkillProof } from '../api/career.types';

/** ⚠️ `Screen`/`BottomSheet` gọi `useSafeAreaInsets()` — thiếu provider là ném lỗi. */
const METRICS: Metrics = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };

export function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: Infinity, retry: false, staleTime: 0 } } });
}

/** `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithClient(ui: ReactElement, client: QueryClient = makeClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return { client, screen: await render(ui, { wrapper: Wrapper }) };
}

export function httpError(status: number, code: string): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, message: 'Câu của server' } },
    headers: {},
    status,
    statusText: '',
  });
}

export const SUMMARY = { category: 'FRONTEND' as const, code: 'reactjs', description: 'Giao diện web', icon: 'keyboard', id: 'skill-react', name: 'ReactJS' };

export function makeItem(over: Partial<SkillCatalogItem> = {}): SkillCatalogItem {
  return {
    ...SUMMARY,
    criteria: { minAvgPeerScore: 8, minStoryPoints: null, requireReview: false, requiredTasksDone: 50 },
    labelMatch: ['reactjs'],
    myBadge: null,
    myProgress: {
      achieved: false,
      avgPeerScore: 7.7,
      remaining: { peerScore: 0.3, reviewedTasks: 0, storyPoints: 0, tasks: 18 },
      reviewedTasks: 32,
      storyPoints: 96,
      tasksDone: 32,
    },
    order: 0,
    ...over,
  };
}

export function makeBadge(over: Partial<SkillBadge> = {}): SkillBadge {
  return {
    proof: { avgPeerScore: 8.2, storyPoints: 64.5, tasksDone: 50 },
    revoked: false,
    revokedNotice: null,
    skill: SUMMARY,
    unlockedAt: '2026-09-12T03:00:00.000Z',
    ...over,
  };
}

export function makeProof(over: Partial<SkillProof> = {}): SkillProof {
  return {
    avgPeerScore: 8.2,
    revoked: false,
    skill: SUMMARY,
    storyPoints: 64.5,
    tasks: [
      { completedAt: '2026-09-10T03:00:00.000Z', reviewScore: 8.5, storyPoints: 5, title: null, workspaceName: null },
      { completedAt: '2026-09-11T03:00:00.000Z', reviewScore: null, storyPoints: 2.5, title: 'Trang đăng nhập', workspaceName: 'Nhóm Alpha' },
    ],
    tasksDone: 50,
    unlockedAt: '2026-09-12T03:00:00.000Z',
    ...over,
  };
}
