/**
 * Đồ dùng chung cho bài kiểm tab "Mẫu nhóm" (p5-04 admin.md §4): fixture `AdminTemplateDto` ĐÚNG hình dạng BE
 * (`be/src/modules/workspace-templates`) và bộ handler MSW có trạng thái (danh sách, PUT có khoá lạc quan `expectedVersion`,
 * `capabilities`, nhật ký) — mỗi file test dựng `setupServer(...templateHandlers(state))` riêng.
 *
 * Tệp không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { http, HttpResponse } from 'msw';

import type {
  TemplateChannel,
  WorkspaceTemplate,
} from '@/features/system-config/templates/types/templates.types';

export const channel = (
  key: string,
  name: string,
  over: Partial<TemplateChannel> = {},
): TemplateChannel => ({
  key,
  name,
  description: '',
  type: 'TEXT',
  visibility: 'PUBLIC',
  postingPolicy: 'MEMBERS',
  defaultSelected: true,
  ...over,
});

export const COURSE: WorkspaceTemplate = {
  code: 'course',
  name: 'Nhóm môn học',
  description: 'Lớp học phần: thông báo, thảo luận, bài tập.',
  channels: [
    channel('thong-bao', 'Thông báo', { postingPolicy: 'ADMINS_ONLY' }),
    channel('thao-luan', 'Thảo luận'),
    channel('bai-tap', 'Bài tập', { defaultSelected: false }),
  ],
  isActive: true,
  order: 1,
  version: 3,
  updatedBy: null,
  updatedAt: '2026-09-20T03:00:00.000Z',
};

export const CAPSTONE: WorkspaceTemplate = {
  code: 'capstone',
  name: 'Đồ án',
  description: 'Nhóm đồ án: tiến độ, thiết kế, họp nhóm.',
  channels: [
    channel('tien-do', 'Tiến độ'),
    channel('hop-nhom', 'Họp nhóm', { type: 'VOICE', defaultSelected: false }),
  ],
  isActive: true,
  order: 2,
  version: 5,
  updatedBy: '64a1b2c3d4e5f60718293a99',
  updatedAt: '2026-09-21T04:30:00.000Z',
};

export const SELF_STUDY: WorkspaceTemplate = {
  code: 'self-study',
  name: 'Nhóm tự học',
  description: 'Học cùng nhau.',
  channels: [channel('muc-tieu', 'Mục tiêu')],
  isActive: false,
  order: 3,
  version: 1,
  updatedBy: null,
  updatedAt: '2026-09-19T01:00:00.000Z',
};

export const freshTemplates = (): WorkspaceTemplate[] =>
  structuredClone([COURSE, CAPSTONE, SELF_STUDY]);

export interface TemplatePut {
  code: string;
  body: {
    name?: string;
    description?: string;
    isActive?: boolean;
    order?: number;
    channels?: TemplateChannel[];
    expectedVersion: number;
    reason: string;
  };
}

/** Trạng thái "máy chủ" mà handler đọc/ghi — test đặt lại ở `beforeEach`. */
export interface TemplateServerState {
  templates: WorkspaceTemplate[];
  puts: TemplatePut[];
  /** Có giá trị ⇒ PUT trả lỗi này thay vì áp dụng. */
  putError: { status: number; code: string; message?: string; details?: unknown } | null;
  voiceEnabled: boolean;
  pomodoroEnabled: boolean;
  listStatus: number;
  /** Chuỗi truy vấn (`?targetType=…`) của mọi lần gọi `GET /audit-logs`. */
  auditSearches: string[];
}

export const newTemplateState = (): TemplateServerState => ({
  templates: freshTemplates(),
  puts: [],
  putError: null,
  voiceEnabled: false,
  pomodoroEnabled: false,
  listStatus: 200,
  auditSearches: [],
});

const errorBody = (code: string, details?: unknown, message = code) => ({
  success: false,
  error: { code, message, ...(details !== undefined && { details }) },
});

export function templateHandlers(state: TemplateServerState) {
  return [
    http.get('*/admin/workspace-templates', () => {
      if (state.listStatus !== 200) {
        return HttpResponse.json(errorBody('SYS_500'), { status: state.listStatus });
      }
      const sorted = [...state.templates].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
      return HttpResponse.json({ success: true, data: sorted });
    }),
    http.put('*/admin/workspace-templates/:code', async ({ request, params }) => {
      const body = (await request.json()) as TemplatePut['body'];
      const code = String(params.code);
      state.puts.push({ code, body });
      if (state.putError) {
        const { code: errCode, details, message, status } = state.putError;
        return HttpResponse.json(errorBody(errCode, details, message), { status });
      }
      const current = state.templates.find((t) => t.code === code);
      if (!current) return HttpResponse.json(errorBody('TPL_001'), { status: 404 });
      if (body.expectedVersion !== current.version) {
        return HttpResponse.json(errorBody('RES_003'), { status: 409 });
      }
      const { expectedVersion, reason, ...patch } = body;
      void expectedVersion;
      void reason;
      const next: WorkspaceTemplate = {
        ...current,
        ...patch,
        version: current.version + 1,
        updatedBy: '64a1b2c3d4e5f60718293a01',
        updatedAt: '2026-09-25T02:00:00.000Z',
      };
      state.templates = state.templates.map((t) => (t.code === code ? next : t));
      return HttpResponse.json({ success: true, data: next });
    }),
    http.get('*/capabilities', () =>
      HttpResponse.json({
        success: true,
        data: {
          features: {
            communication: { enabled: true, available: true },
            voice: { enabled: state.voiceEnabled, available: true },
            pomodoro: { enabled: state.pomodoroEnabled, available: true },
          },
        },
      }),
    ),
    http.get('*/audit-logs', ({ request }) => {
      state.auditSearches.push(new URL(request.url).search);
      return HttpResponse.json({
        success: true,
        data: [],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });
    }),
  ];
}
