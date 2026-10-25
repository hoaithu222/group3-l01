/**
 * Riêng tư & an toàn của tab `jobs` (p0-04 §4 "Riêng tư" · `docs/rules/test-viewpoint.md`):
 *  - payload job hiện NGUYÊN VĂN bản đã che của BE (`***` cho content/token/…), không có
 *    đường nào lấy được giá trị gốc — FE chỉ gọi đúng các endpoint danh sách
 *  - nút "Chép" chỉ chép thứ đang hiện (bản đã che)
 *  - dữ liệu bị BE cắt (> 2 KiB) được báo rõ, không giả vờ là đầy đủ
 *  - lỗi/tên job/loại sự kiện chỉ render dạng chữ (không HTML ⇒ không XSS)
 *
 * "BE" giả chỉ trả bản đã che qua API danh sách (đúng như `maskPayload`) và có thêm 1
 * endpoint BẪY trả giá trị gốc (`RAW_*`): nếu FE tự tìm cách lấy dữ liệu chưa che thì
 * giá trị gốc sẽ lọt lên màn (và danh sách request có thêm đường dẫn lạ) — bài kiểm sẽ đỏ.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import JobsTab from '@/features/system-config/jobs/JobsTab';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  createJobsBackend,
  makeFailedJob,
  makeOutbox,
  renderWithProviders,
  signInAdmin,
} from './jobs-test-utils';

const RAW_CONTENT = 'Nội dung tin nhắn riêng tư của người dùng';
const RAW_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.token-that-khong-duoc-lo';
const RAW_EMAIL = 'nguoi.dung.that@congty.vn';

const server = setupServer();
const requested: string[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', ({ request }) => {
    requested.push(`${request.method} ${new URL(request.url).pathname}`);
  });
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  requested.length = 0;
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
  signInAdmin();
});

/** Payload ĐÃ CHE đúng như `maskPayload` của BE (`token|password|secret|content|body|email|phone`). */
const MASKED = {
  template: 'welcome',
  email: '***',
  userId: 'u-123',
  vars: { content: '***', token: '***', locale: 'vi' },
};

/** Endpoint BẪY — chỉ tồn tại để chứng minh FE không bao giờ gọi tới. */
const trap = http.get('*/admin/jobs/:queue/:jobId', () =>
  HttpResponse.json({
    success: true,
    data: { content: RAW_CONTENT, token: RAW_TOKEN, email: RAW_EMAIL },
  }),
);

async function openDrawer(job = makeFailedJob({ dataPreview: MASKED })) {
  const backend = createJobsBackend({ failed: [job] });
  server.use(trap, ...backend.handlers);
  const user = userEvent.setup();
  renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=failed');
  await user.click(await screen.findByRole('button', { name: job.failedReason ?? '' }));
  const drawer = within(await screen.findByRole('dialog', { name: `Job lỗi — ${job.name}` }));
  return { drawer, user, backend };
}

describe('payload job đã che', () => {
  it('JsonViewer hiện `***` cho content/token/email và KHÔNG chứa giá trị gốc ở bất kỳ đâu trên màn', async () => {
    const { drawer } = await openDrawer();

    const payload = drawer.getByText(/"template": "welcome"/);
    expect(payload).toHaveTextContent('"content": "***"');
    expect(payload).toHaveTextContent('"token": "***"');
    expect(payload).toHaveTextContent('"email": "***"');
    // Trường không nhạy cảm vẫn đọc được để chẩn đoán.
    expect(payload).toHaveTextContent('"userId": "u-123"');

    const everything = document.body.textContent ?? '';
    expect(everything).not.toContain(RAW_CONTENT);
    expect(everything).not.toContain(RAW_TOKEN);
    expect(everything).not.toContain(RAW_EMAIL);
  });

  it('FE chỉ gọi endpoint DANH SÁCH — không có đường nào khác để lấy payload gốc', async () => {
    await openDrawer();

    const unique = [...new Set(requested)];
    expect(unique).toEqual([expect.stringMatching(/^GET .*\/admin\/jobs\/failed$/)]);
  });

  it('nút "Chép" ở khối payload chỉ chép bản đã che', async () => {
    const { drawer, user } = await openDrawer();

    // Hai JsonViewer trong drawer: [lý do lỗi, payload] — payload là cái thứ hai.
    const copyButtons = drawer.getAllByRole('button', { name: 'Chép' });
    await user.click(copyButtons[copyButtons.length - 1]);

    await waitFor(async () => {
      const copied = await navigator.clipboard.readText();
      expect(copied).toContain('"content": "***"');
      expect(copied).not.toContain(RAW_CONTENT);
      expect(copied).not.toContain(RAW_TOKEN);
    });
  });

  it('payload bị BE cắt (> 2 KiB) ⇒ có thông báo rõ, vẫn hiện nguyên phần preview nhận được', async () => {
    const truncated = {
      truncated: true,
      preview: '{"template":"welcome","email":"***","vars":{"con',
    };
    const { drawer } = await openDrawer(makeFailedJob({ dataPreview: truncated }));

    expect(drawer.getByText('Dữ liệu lớn hơn 2 KiB — chỉ hiện phần đầu')).toBeInTheDocument();
    expect(drawer.getByText(/"truncated": true/)).toBeInTheDocument();
  });

  it('payload bình thường ⇒ KHÔNG có thông báo "bị cắt"', async () => {
    const { drawer } = await openDrawer();

    expect(drawer.queryByText('Dữ liệu lớn hơn 2 KiB — chỉ hiện phần đầu')).not.toBeInTheDocument();
  });
});

describe('chỉ render dạng chữ (không HTML)', () => {
  const XSS = '<img src=x onerror=alert(1)>';

  it('lý do lỗi + tên job có thẻ HTML ⇒ hiện nguyên chữ ở bảng và drawer, không tạo phần tử', async () => {
    const { drawer } = await openDrawer(
      makeFailedJob({
        name: `job<script>alert(1)</script>`,
        failedReason: XSS,
        dataPreview: MASKED,
      }),
    );

    expect(drawer.getByText(XSS)).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
    // Bảng phía sau cũng chỉ là chữ.
    expect(screen.getAllByText(/job<script>alert\(1\)<\/script>/).length).toBeGreaterThan(0);
  });

  it('outbox: lỗi cuối + loại sự kiện có thẻ HTML ⇒ chỉ là chữ', async () => {
    const backend = createJobsBackend({
      outbox: [makeOutbox({ lastError: XSS, type: '<b>call.type</b>' })],
    });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=outbox');

    expect(await screen.findByText(XSS)).toBeInTheDocument();
    expect(screen.getByText('<b>call.type</b>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('outbox KHÔNG hiển thị payload (kể cả bản đã che) — bảng chỉ có metadata', async () => {
    const backend = createJobsBackend({
      outbox: [makeOutbox({ payloadPreview: { callId: 'c-secret-id', token: '***' } })],
    });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=outbox');

    await screen.findByText('Redis ECONNREFUSED');
    expect(document.body.textContent).not.toContain('c-secret-id');
    expect(document.body.textContent).not.toContain('callId');
  });
});
