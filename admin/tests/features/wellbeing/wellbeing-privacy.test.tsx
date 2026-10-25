/**
 * QUYỀN RIÊNG TƯ của tab "Sức khoẻ học tập" (p7-03 README §6, admin.md §1, §4): admin KHÔNG BAO GIỜ thấy dữ liệu sức khoẻ của một người — chỉ số đếm ẩn danh tổng hợp và cấu hình luật.
 * Bài kiểm khoá điều đó ở BỐN lớp: (1) tầng API chỉ có hai đường dẫn tĩnh, không có tham số người dùng; (2) mã nguồn phân hệ không chạm định danh người dùng, không điều hướng chi tiết, không ô tìm kiếm;
 * (3) không có route/menu/drawer người dùng nào nhắc tới sức khoẻ học tập; (4) chạy thật cả hai nhóm và ghi lại MỌI request + kiểm DOM không có ô nhập/liên kết.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';
import WellbeingTab from '@/features/wellbeing/pages/WellbeingTab';
import { wellbeingApi } from '@/features/wellbeing/service/wellbeing.api';
import { wellbeingService } from '@/features/wellbeing/service/wellbeing.service';

import { makeOverview, makeRules, okBody, signIn } from './wellbeing-fixtures';

const WELLBEING_SOURCES = import.meta.glob('../../../src/features/wellbeing/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const USER_SOURCES = import.meta.glob('../../../src/features/user/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Bỏ comment trước khi quét: lời giải thích RIÊNG TƯ trong comment được phép nhắc tới chính những thứ bị cấm. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const codeOf = (sources: Record<string, string>) =>
  Object.entries(sources).map(([path, text]) => [path, stripComments(text)] as const);

describe('tầng API — không có đường nào theo người dùng', () => {
  it('chỉ có HAI đường dẫn admin, cả hai là chuỗi tĩnh (không hàm nhận id)', () => {
    expect(Object.values(wellbeingApi)).toEqual([
      '/admin/wellbeing/overview',
      '/admin/wellbeing/rules',
    ]);
    for (const path of Object.values(wellbeingApi)) expect(typeof path).toBe('string');
  });

  it('service chỉ có tổng quan, đọc bộ luật, lưu bộ luật — không hàm tra cứu/liệt kê người dùng', () => {
    expect(Object.keys(wellbeingService).sort()).toEqual(['overview', 'putRules', 'rules']);
  });
});

describe('mã nguồn phân hệ wellbeing', () => {
  const files = codeOf(WELLBEING_SOURCES);

  it('quét được mã nguồn (bảo vệ chính bài kiểm khỏi quét rỗng)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it('không chạm định danh người dùng: không userId, không đường dẫn /users', () => {
    const offenders = files
      .filter(([, code]) => /\buser[-_]?id\b/i.test(code) || /\/users?\b/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('không điều hướng tới chi tiết/không có ô tìm kiếm: không useParams/useNavigate/Link/href và không ô tìm kiếm IME', () => {
    const offenders = files
      .filter(([, code]) =>
        /useParams|useNavigate|<Link\b|<NavLink\b|href=|ImeSafeSearch|SearchField|type="search"/.test(
          code,
        ),
      )
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('không import phân hệ người dùng/gamification (giữ ranh giới, tránh khép vòng `user` → `gamification`)', () => {
    const offenders = files
      .filter(([, code]) => /from '@\/features\/(user|gamification)[/']/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('không có lối vào theo người dùng ở nơi khác', () => {
  it('drawer/tab người dùng (`features/user`) không nhắc tới sức khoẻ học tập / burnout', () => {
    const files = codeOf(USER_SOURCES);
    expect(files.length).toBeGreaterThan(5);
    const offenders = files
      .filter(([, code]) => /wellbeing|burnout|sức khoẻ học tập/i.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('registry: không module nào và không route con nào mang wellbeing/burnout', () => {
    const paths = MODULE_REGISTRY.flatMap((m) => [
      m.id,
      m.path,
      ...(m.routes ?? []).map((r) => r.path),
    ]);
    expect(paths.filter((p) => /wellbeing|burnout/i.test(p))).toEqual([]);
  });
});

describe('chạy thật: mọi request và DOM', () => {
  const requested: string[] = [];
  const server = setupServer(
    http.get('*/admin/wellbeing/overview', ({ request }) => {
      requested.push(new URL(request.url).pathname);
      return okBody(makeOverview());
    }),
    http.get('*/admin/wellbeing/rules', ({ request }) => {
      requested.push(new URL(request.url).pathname);
      return okBody(makeRules());
    }),
  );

  beforeAll(() => {
    configure({ asyncUtilTimeout: 4000 });
    // Mọi request ngoài hai đường trên đều làm bài kiểm ĐỎ — không có gì âm thầm gọi tới nơi khác.
    server.listen({ onUnhandledRequest: 'error' });
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => {
    configure({ asyncUtilTimeout: 1000 });
    server.close();
  });
  beforeEach(() => {
    requested.length = 0;
    useAuthStore.getState().clearAuth();
    signIn(['gamification:view']); // chỉ xem: không có audit-log:view nên nhật ký không gọi API
  });

  it('cả Tổng quan lẫn Bộ luật chỉ gọi hai endpoint tổng hợp, không có ô nhập/liên kết nào để tra cứu người dùng', async () => {
    const router = createMemoryRouter([{ path: '/gamification', element: <WellbeingTab /> }], {
      initialEntries: ['/gamification?tab=wellbeing'],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const noLookupControls = () => {
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      expect(screen.queryAllByRole('searchbox')).toHaveLength(0);
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    };

    await screen.findByText('≈ 120');
    noLookupControls();

    await userEvent.click(screen.getByRole('button', { name: 'Bộ luật đánh giá' }));
    await screen.findByText('Làm việc liên tục quá lâu');
    noLookupControls();

    await waitFor(() => expect(requested.length).toBeGreaterThanOrEqual(2));
    const endpoints = [
      ...new Set(requested.map((p) => p.replace(/^.*(\/admin\/wellbeing\/)/, '$1'))),
    ].sort();
    expect(endpoints).toEqual(['/admin/wellbeing/overview', '/admin/wellbeing/rules']);
    expect(requested.every((p) => !/user/i.test(p))).toBe(true);
  });
});
