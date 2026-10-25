/**
 * `asset-upload.adapter` (p0-05 admin.md §2.2, §4) — 3 bước `/assets`:
 *   PRESIGNED_PUT → XHR PUT (kèm header ký) → `POST /complete` → poll tới READY
 *   API_PUT       → FormData `PUT /content` → poll tới READY (BE tự chốt, KHÔNG có `/complete`)
 *
 * `/assets/*` mock bằng MSW (đi đúng axios + interceptor thật); bước PUT lên storage dùng XHR giả
 * tiêm qua `createXhr` vì MSW không mô phỏng được `upload.onprogress`, và stub cả `XMLHttpRequest`
 * toàn cục sẽ phá luôn axios (adapter xhr của axios cũng dùng nó).
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/core/api/client';
import {
  assetKindFromMime,
  AssetUploadError,
  createAssetUploader,
  uploadAsset,
  type AssetDto,
  type AssetStatus,
  type UploadInstruction,
} from '@/core/uploads/asset-upload.adapter';
import { useUploadQueueStore } from '@/shared/widgets/upload-center';

const ASSET_ID = '507f1f77bcf86cd799439011';
const PRESIGNED: UploadInstruction = {
  method: 'PRESIGNED_PUT',
  url: 'https://bucket.s3.test/dev/avatar/a.png?X-Amz-Signature=abc',
  headers: { 'Content-Type': 'image/png', 'Content-Length': '5' },
  expiresAt: '2026-09-19T08:00:00.000Z',
};

const asset = (status: AssetStatus, extra: Partial<AssetDto> = {}): AssetDto => ({
  id: ASSET_ID,
  scope: 'AVATAR',
  kind: 'IMAGE',
  status,
  mime: 'image/png',
  size: 5,
  originalName: 'a.png',
  width: null,
  height: null,
  durationMs: null,
  waveform: null,
  hasThumb: false,
  rejectReason: null,
  createdAt: '2026-09-19T07:00:00.000Z',
  readyAt: null,
  ...extra,
});

// ── Trạng thái của mock ─────────────────────────────────────────────────────────
let events: string[] = [];
let createBodies: Array<Record<string, unknown>> = [];
let createKeys: Array<string | null> = [];
let completeBodies: Array<Record<string, unknown>> = [];
let contentUpload: { contentType: string | null; raw: string } = { contentType: null, raw: '' };
let instruction: UploadInstruction = PRESIGNED;
let completeStatus: AssetStatus = 'PROCESSING';
let getSequence: AssetDto[] = [];
let getCalls = 0;

const server = setupServer(
  http.post('*/assets', async ({ request }) => {
    events.push('create');
    createBodies.push((await request.json()) as Record<string, unknown>);
    createKeys.push(request.headers.get('Idempotency-Key'));
    return HttpResponse.json(
      { success: true, data: { asset: asset('UPLOADING'), upload: instruction } },
      { status: 201 },
    );
  }),
  http.post('*/assets/:id/complete', async ({ request }) => {
    events.push('complete');
    completeBodies.push((await request.json()) as Record<string, unknown>);
    return HttpResponse.json({ success: true, data: asset(completeStatus) });
  }),
  http.put('*/assets/:id/content', async ({ request }) => {
    events.push('content');
    // Đọc thô: `request.formData()` của undici từ chối `File` của jsdom (khác lớp). Nội dung/tên tệp ở
    // đường mạng cũng bị jsdom→undici làm mất (`filename="blob"`) nên KHÔNG kiểm ở đây — xem spy `apiClient.put`.
    contentUpload = { contentType: request.headers.get('content-type'), raw: await request.text() };
    return HttpResponse.json({ success: true, data: asset('PROCESSING') });
  }),
  http.get('*/assets/:id', () => {
    events.push('poll');
    const next = getSequence[Math.min(getCalls, getSequence.length - 1)] ?? asset('READY');
    getCalls += 1;
    return HttpResponse.json({ success: true, data: next });
  }),
  http.post('*/assets/:id/upload-url', () => {
    events.push('reissue');
    return HttpResponse.json({
      success: true,
      data: { ...PRESIGNED, url: 'https://bucket.s3.test/fresh' },
    });
  }),
  http.post('*/assets/:id/abort', () => {
    events.push('abort');
    return HttpResponse.json({ success: true, data: { status: 'DELETED' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── XHR giả cho bước PUT lên storage ───────────────────────────────────────────
class FakeXhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 200;
  aborted = false;
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  private readonly plan: { status: number; hang: boolean };

  constructor(plan: { status: number; hang: boolean }) {
    this.plan = plan;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    events.push('put');
    this.body = body;
    if (this.plan.hang) return;
    setTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      this.status = this.plan.status;
      this.onload?.();
    }, 0);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

let xhrs: FakeXhr[] = [];
let xhrPlans: Array<{ status: number; hang: boolean }> = [];
const createXhr = () => {
  const x = new FakeXhr(xhrPlans.shift() ?? { status: 200, hang: false });
  xhrs.push(x);
  return x as unknown as XMLHttpRequest;
};

const png = () => new File(['12345'], 'a.png', { type: 'image/png' });
/** Poll nhanh cho test — bậc backoff 1 ms. */
const FAST = { pollBackoffMs: [1], createXhr } as const;

describe('asset-upload.adapter', () => {
  beforeEach(() => {
    events = [];
    createBodies = [];
    createKeys = [];
    completeBodies = [];
    contentUpload = { contentType: null, raw: '' };
    instruction = PRESIGNED;
    completeStatus = 'PROCESSING';
    getSequence = [asset('PROCESSING'), asset('PROCESSING'), asset('READY', { hasThumb: true })];
    getCalls = 0;
    xhrs = [];
    xhrPlans = [];
    useUploadQueueStore.setState({ tasks: [], uploader: null });
  });

  it('assetKindFromMime: ảnh/video/âm thanh theo tiền tố, còn lại là FILE', () => {
    expect(assetKindFromMime('image/png')).toBe('IMAGE');
    expect(assetKindFromMime('VIDEO/mp4')).toBe('VIDEO');
    expect(assetKindFromMime('audio/mpeg')).toBe('AUDIO');
    expect(assetKindFromMime('application/pdf')).toBe('FILE');
    expect(assetKindFromMime('text/csv')).toBe('FILE');
  });

  describe('PRESIGNED_PUT', () => {
    it('create (Idempotency-Key + kind suy từ mime) → XHR PUT kèm header ký → complete → poll tới READY', async () => {
      const progress: number[] = [];
      const seenIds: string[] = [];

      const result = await uploadAsset(png(), {
        ...FAST,
        scope: 'AVATAR',
        idempotencyKey: 'upl_abc_1',
        onProgress: (p) => progress.push(p),
        onAssetId: (id) => seenIds.push(id),
      });

      expect(result.status).toBe('READY');
      expect(result.hasThumb).toBe(true);

      // Đúng thứ tự 3 bước, rồi poll tới khi READY (2 lần PROCESSING + 1 lần READY).
      expect(events).toEqual(['create', 'put', 'complete', 'poll', 'poll', 'poll']);
      expect(createBodies).toEqual([
        { scope: 'AVATAR', kind: 'IMAGE', fileName: 'a.png', mime: 'image/png', size: 5 },
      ]);
      expect(createKeys).toEqual(['upl_abc_1']);
      expect(completeBodies).toEqual([{ size: 5 }]);
      expect(seenIds).toEqual([ASSET_ID]);

      // XHR PUT tới URL ký, gửi ĐÚNG File, Content-Type theo header ký; Content-Length do trình duyệt tự đặt.
      expect(xhrs).toHaveLength(1);
      const xhr = xhrs[0]!;
      expect(xhr.method).toBe('PUT');
      expect(xhr.url).toBe((PRESIGNED as { url: string }).url);
      expect(xhr.headers).toEqual({ 'Content-Type': 'image/png' });
      expect(xhr.body).toBeInstanceOf(File);

      // Tải nội dung chiếm 90% thanh tiến độ (50% → 45, 100% → 90), phần cuối là chốt + chờ xử lý.
      expect(progress).toEqual([45, 90, 90, 95]);
    });

    it('complete trả READY ngay (ảnh nhỏ — fast path của BE) → không poll', async () => {
      completeStatus = 'READY';

      const result = await uploadAsset(png(), { ...FAST, scope: 'AVATAR' });

      expect(result.status).toBe('READY');
      expect(events).toEqual(['create', 'put', 'complete']);
    });

    it('URL ký hết hạn (PUT 403) → cấp lại chỉ dẫn qua /upload-url rồi PUT lại đúng một lần', async () => {
      xhrPlans = [
        { status: 403, hang: false },
        { status: 200, hang: false },
      ];

      const result = await uploadAsset(png(), { ...FAST, scope: 'AVATAR' });

      expect(result.status).toBe('READY');
      expect(events.slice(0, 5)).toEqual(['create', 'put', 'reissue', 'put', 'complete']);
      expect(xhrs.map((x) => x.url)).toEqual([
        (PRESIGNED as { url: string }).url,
        'https://bucket.s3.test/fresh',
      ]);
    });

    it('PUT lỗi khác 403 → ném AssetUploadError, không complete', async () => {
      xhrPlans = [{ status: 500, hang: false }];

      const err = await uploadAsset(png(), { ...FAST, scope: 'AVATAR' }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AssetUploadError);
      expect(err).toMatchObject({ code: 'ASSET_PUT_FAILED', status: 500 });
      expect(events).toEqual(['create', 'put']);
    });

    it('huỷ giữa lúc PUT → abort XHR, báo BE /abort, ném AbortError', async () => {
      xhrPlans = [{ status: 200, hang: true }];
      const controller = new AbortController();

      const pending = uploadAsset(png(), {
        ...FAST,
        scope: 'AVATAR',
        signal: controller.signal,
      }).catch((e: unknown) => e);
      await vi.waitFor(() => expect(events).toContain('put'));
      controller.abort();

      const err = await pending;
      expect((err as Error).name).toBe('AbortError');
      expect(xhrs[0]!.aborted).toBe(true);
      await vi.waitFor(() => expect(events).toContain('abort'));
    });
  });

  describe('API_PUT', () => {
    beforeEach(() => {
      instruction = { method: 'API_PUT', url: 'http://localhost:3000/api/v1/assets/x/content' };
    });

    it('PUT /content bằng FormData (trường `file`) qua apiClient → poll tới READY, KHÔNG gọi /complete', async () => {
      const progress: number[] = [];
      const put = vi.spyOn(apiClient, 'put');

      const result = await uploadAsset(png(), {
        ...FAST,
        scope: 'AVATAR',
        onProgress: (p) => progress.push(p),
      });
      const [url, form, config] = put.mock.calls[0]!;
      put.mockRestore();

      expect(result.status).toBe('READY');
      expect(events).toEqual(['create', 'content', 'poll', 'poll', 'poll']);
      expect(events).not.toContain('complete');
      // Không có XHR giả nào được dùng — API_PUT đi qua axios.
      expect(xhrs).toHaveLength(0);

      expect(contentUpload.contentType).toMatch(/^multipart\/form-data; boundary=/);
      expect(contentUpload.raw).toContain('name="file"');

      // FormData gửi đi: trường tệp PHẢI tên `file` (multer `uploadSingle("file")`), đúng tệp + tên gốc;
      // tắt timeout mặc định (tệp lớn/mạng chậm) và báo tiến độ tải lên qua axios.
      expect(url).toBe(`/assets/${ASSET_ID}/content`);
      expect(form).toBeInstanceOf(FormData);
      const sent = (form as FormData).get('file') as File;
      expect(sent).toBeInstanceOf(File);
      expect(sent.name).toBe('a.png');
      expect(await sent.text()).toBe('12345');
      expect(config).toMatchObject({ timeout: 0 });
      expect(config?.onUploadProgress).toBeTypeOf('function');
      expect(progress[progress.length - 1]).toBe(95);
    });

    it('asset REJECTED sau xử lý → ném AssetUploadError kèm lý do BE', async () => {
      getSequence = [
        asset('PROCESSING'),
        asset('REJECTED', { rejectReason: 'Nội dung tệp không khớp loại khai báo' }),
      ];

      const err = await uploadAsset(png(), { ...FAST, scope: 'AVATAR' }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AssetUploadError);
      expect(err).toMatchObject({
        code: 'ASSET_REJECTED',
        message: 'Nội dung tệp không khớp loại khai báo',
      });
    });

    it('PROCESSING quá hạn poll → ném ASSET_TIMEOUT', async () => {
      getSequence = [asset('PROCESSING')];

      const err = await uploadAsset(png(), {
        ...FAST,
        scope: 'AVATAR',
        pollTimeoutMs: 20,
        pollBackoffMs: [5],
      }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AssetUploadError);
      expect(err).toMatchObject({ code: 'ASSET_TIMEOUT' });
    });
  });

  it('chặn sớm tệp rỗng/không có MIME — không gọi BE', async () => {
    const noType = new File(['x'], 'lạ', { type: '' });
    const empty = new File([], 'a.png', { type: 'image/png' });

    for (const f of [noType, empty]) {
      const err = await uploadAsset(f, { ...FAST, scope: 'AVATAR' }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'ASSET_001' });
    }
    expect(events).toEqual([]);
  });

  describe('createAssetUploader ↔ upload-queue.store', () => {
    it('task ghi assetId + success/100, dùng id task làm Idempotency-Key, KHÔNG ghi id vào `url`', async () => {
      const [taskId] = useUploadQueueStore
        .getState()
        .enqueue([png()], createAssetUploader({ scope: 'AVATAR', ...FAST }));

      await vi.waitFor(() =>
        expect(useUploadQueueStore.getState().tasks[0]?.status).toBe('success'),
      );

      const task = useUploadQueueStore.getState().tasks[0]!;
      expect(task).toMatchObject({ id: taskId, assetId: ASSET_ID, progress: 100 });
      expect(task.url).toBeUndefined();
      expect(createKeys).toEqual([taskId]);
    });

    it('uploader lỗi → task ở trạng thái error kèm thông điệp', async () => {
      xhrPlans = [{ status: 500, hang: false }];
      useUploadQueueStore
        .getState()
        .enqueue([png()], createAssetUploader({ scope: 'AVATAR', ...FAST }));

      await vi.waitFor(() => expect(useUploadQueueStore.getState().tasks[0]?.status).toBe('error'));

      const task = useUploadQueueStore.getState().tasks[0]!;
      expect(task.error).toContain('HTTP 500');
      // assetId đã được báo từ bước create — hàng đợi giữ để "Thử lại" biết tệp đã đăng ký.
      expect(task.assetId).toBe(ASSET_ID);
    });
  });
});
