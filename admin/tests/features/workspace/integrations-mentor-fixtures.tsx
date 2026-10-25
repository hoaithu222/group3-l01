/**
 * Đồ dùng chung cho bài kiểm tab "Tích hợp" (p5-03 admin.md §2.4) và "Cố vấn" (p6-03 admin.md §2.2) của workspace: fixture theo ĐÚNG hợp đồng BE
 * (`IntegrationAdminService.listForWorkspace`, `MentorAdminService.workspaceOverview`). Không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import type { AdminWorkspaceConnection } from '@/features/integration';
import type {
  WorkspaceMentorEngagement,
  WorkspaceMentorOverview,
  WorkspaceMentorPost,
} from '@/features/workspace/types/workspace-mentor.types';

export const WORKSPACE = { id: 'ws-1', name: 'Nhóm Alpha' };

export function makeConnection(
  over: Partial<AdminWorkspaceConnection> = {},
): AdminWorkspaceConnection {
  return {
    id: '650000000000000000000001',
    workspace: WORKSPACE,
    provider: 'GITHUB',
    externalName: 'vci/app',
    status: 'ACTIVE',
    statusReason: null,
    createdBy: { id: 'u-1', name: 'Nguyễn Chủ Nhóm' },
    lastEventAt: '2026-09-20T02:00:00.000Z',
    updatedAt: '2026-09-20T02:00:00.000Z',
    target: { scopeType: 'CHANNEL', name: 'thong-bao', private: false },
    ...over,
  };
}

/** Ba kết nối: kênh công khai, kênh riêng tư (không tên), nhóm chat lỗi. */
export const CONNECTIONS: AdminWorkspaceConnection[] = [
  makeConnection(),
  makeConnection({
    id: '650000000000000000000002',
    provider: 'FIGMA',
    externalName: 'Bộ thiết kế Alpha',
    target: { scopeType: 'CHANNEL', name: null, private: true },
  }),
  makeConnection({
    id: '650000000000000000000003',
    provider: 'GITLAB',
    externalName: 'gitlab.com/alpha/api',
    status: 'ERROR',
    statusReason: 'TARGET_FORBIDDEN',
    lastEventAt: null,
    target: { scopeType: 'CONVERSATION', name: null, private: true },
  }),
];

export function makePost(over: Partial<WorkspaceMentorPost> = {}): WorkspaceMentorPost {
  return {
    id: '650000000000000000000a01',
    title: 'Cần cố vấn Kiến trúc phần mềm',
    status: 'OPEN',
    applicantsCount: 5,
    pendingCount: 2,
    activeEngagements: 1,
    mentorsNeeded: 2,
    reportedCount: 0,
    createdAt: '2026-09-01T02:00:00.000Z',
    expiresAt: '2026-10-01T02:00:00.000Z',
    hiddenAt: null,
    ...over,
  };
}

export function makeEngagement(
  over: Partial<WorkspaceMentorEngagement> = {},
): WorkspaceMentorEngagement {
  return {
    id: '650000000000000000000b01',
    postId: '650000000000000000000a01',
    status: 'ACTIVE',
    mentor: { id: 'u-m1', name: 'Trần Cố Vấn' },
    post: { id: '650000000000000000000a01', title: 'Cần cố vấn Kiến trúc phần mềm' },
    startedAt: '2026-09-05T02:00:00.000Z',
    endsAt: '2026-10-05T02:00:00.000Z',
    endedAt: null,
    endedReason: null,
    ...over,
  };
}

export const MENTOR_OVERVIEW: WorkspaceMentorOverview = {
  posts: [
    makePost(),
    makePost({
      id: '650000000000000000000a02',
      title: 'Cố vấn UX cho đồ án',
      status: 'CLOSED',
      hiddenAt: '2026-09-10T02:00:00.000Z',
      reportedCount: 3,
      pendingCount: 0,
    }),
  ],
  engagements: [
    makeEngagement(),
    makeEngagement({
      id: '650000000000000000000b02',
      mentor: { id: 'u-m2', name: 'Lê Đã Nghỉ' },
      status: 'ENDED',
      endedAt: '2026-09-15T02:00:00.000Z',
      endedReason: 'ENDED_BY_PLATFORM',
    }),
  ],
};
