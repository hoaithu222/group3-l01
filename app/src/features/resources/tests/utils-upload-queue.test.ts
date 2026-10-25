import type { UploadItem } from '@/core/uploads/upload.types';

import type { UploadTarget } from '../store/resource-uploads.store';
import { uploadFailureMessage } from '../utils/error-messages';
import {
  buildQueueRow,
  buildQueueRows,
  queueStateLabel,
  summarizeQueue,
} from '../utils/upload-queue';

function item(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
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
  };
}

const target = (overrides: Partial<UploadTarget> = {}): UploadTarget => ({
  folderId: null,
  idempotencyKey: 'k',
  phase: 'awaiting',
  workspaceId: 'ws',
  ...overrides,
});

describe('dòng hàng đợi = upload + bước thêm vào kho', () => {
  it('ready mà CHƯA tạo Resource ⇒ vẫn "đang xử lý", không huỷ được', () => {
    const row = buildQueueRow(
      item({ status: 'ready', progress: 100 }),
      target({ phase: 'creating' }),
    );
    expect(row).toMatchObject({ canCancel: false, retry: null, state: 'processing' });
  });

  it('ready + created ⇒ xong', () => {
    expect(buildQueueRow(item({ status: 'ready' }), target({ phase: 'created' })).state).toBe(
      'done',
    );
  });

  it('ready + tạo Resource lỗi ⇒ lỗi, thử lại CHỈ bước tạo (không tải lại tệp)', () => {
    const row = buildQueueRow(
      item({ status: 'ready' }),
      target({ errorCode: 'RSC_003', phase: 'failed' }),
    );
    expect(row).toMatchObject({
      reason: 'Tệp chưa sẵn sàng hoặc không thể thêm vào kho tài liệu',
      retry: 'finalize',
      state: 'failed',
    });
  });

  it('upload REJECTED/failed ⇒ nêu lý do bằng chữ và thử lại từ đầu', () => {
    const row = buildQueueRow(item({ errorCode: 'RSC_007', status: 'failed' }), undefined);
    expect(row).toMatchObject({
      reason: 'Kho tài liệu của nhóm đã đầy dung lượng',
      retry: 'upload',
    });
    expect(
      buildQueueRow(item({ errorCode: 'ASSET_001', status: 'failed' }), undefined).reason,
    ).toBe('Định dạng không hỗ trợ');
  });

  it('paused/uploading/cancelled đúng nhãn', () => {
    expect(
      queueStateLabel(buildQueueRow(item({ progress: 45, status: 'uploading' }), undefined)),
    ).toBe('Đang tải 45%');
    expect(queueStateLabel(buildQueueRow(item({ status: 'paused' }), undefined))).toBe(
      'Tạm dừng — chờ kết nối',
    );
    expect(buildQueueRow(item({ status: 'cancelled' }), undefined)).toMatchObject({
      canCancel: false,
      state: 'cancelled',
    });
  });

  it('summarizeQueue đếm đang chạy/lỗi/xong và tiến độ trung bình các dòng đang chạy', () => {
    const rows = buildQueueRows(
      [
        item({ localId: 'a', progress: 20, status: 'uploading' }),
        item({ localId: 'b', progress: 60, status: 'uploading' }),
        item({ errorCode: 'UNKNOWN', localId: 'c', status: 'failed' }),
        item({ localId: 'd', status: 'ready' }),
      ],
      { d: target({ phase: 'created' }) },
    );
    expect(summarizeQueue(rows)).toEqual({ active: 2, done: 1, failed: 1, progress: 40, total: 4 });
  });
});

describe('uploadFailureMessage', () => {
  it('RSC → câu BE; ASSET → bảng của core; mã lạ/thiếu → câu chung', () => {
    expect(uploadFailureMessage('RSC_007')).toBe('Kho tài liệu của nhóm đã đầy dung lượng');
    expect(uploadFailureMessage('ASSET_002')).toBe('Tệp quá lớn');
    expect(uploadFailureMessage('UNKNOWN')).toContain('kiểm tra kết nối');
    expect(uploadFailureMessage(undefined)).toBe('Không tải lên được, thử lại');
  });
});
