import { apiClient } from '@/core/api';
import { runItem } from '@/core/uploads/upload.pipeline';
import { useUploadStore } from '@/core/uploads/upload.store';
import type { UploadItem } from '@/core/uploads/upload.types';

/**
 * Sửa nhỏ `core/uploads` cho p3-01: `UploadItem.workspaceId` được gửi trong
 * `POST /assets` — BE kiểm hạn mức theo workspace TRƯỚC khi cấp URL (`RSC_007`),
 * thiếu thì không có gì để so hạn mức. Scope khác (MESSAGE) KHÔNG gửi trường này.
 * Mock ở biên I/O (`apiClient`), chạy qua đúng logic pipeline thật.
 */
jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, get: jest.fn(), post: jest.fn(), put: jest.fn() },
  };
});
jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  createUploadTask: jest.fn(),
}));

const mockedPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

function seed(overrides: Partial<UploadItem>): void {
  useUploadStore.getState().addItem({
    kind: 'FILE',
    localId: 'l1',
    mime: 'application/pdf',
    name: 'a.pdf',
    progress: 0,
    scope: 'RESOURCE',
    size: 1000,
    status: 'queued',
    uri: 'file:///a.pdf',
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useUploadStore.setState({ items: {} });
  // Dừng ngay sau `POST /assets` (lỗi mạng giả) — chỉ cần kiểm payload của lượt tạo asset.
  mockedPost.mockRejectedValue(new Error('dừng tại đây'));
});

describe('pipeline — gửi workspaceId cho scope RESOURCE', () => {
  it('có workspaceId ⇒ POST /assets mang workspaceId', async () => {
    seed({ scope: 'RESOURCE', workspaceId: 'ws-1' });
    await runItem('l1', () => true);

    expect(mockedPost).toHaveBeenCalledWith(
      '/assets',
      {
        fileName: 'a.pdf',
        kind: 'FILE',
        mime: 'application/pdf',
        scope: 'RESOURCE',
        size: 1000,
        workspaceId: 'ws-1',
      },
      { headers: { 'Idempotency-Key': 'l1' } },
    );
  });

  it('không có workspaceId (MESSAGE…) ⇒ KHÔNG gửi trường này (giữ hành vi cũ)', async () => {
    seed({ scope: 'MESSAGE' });
    await runItem('l1', () => true);

    const payload = mockedPost.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('workspaceId' in payload).toBe(false);
  });
});
