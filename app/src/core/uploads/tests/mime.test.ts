import { assetErrorMessage, guessKindFromMime, resolveKindLimit, validateFile } from '../mime';

describe('validateFile', () => {
  it('từ chối MIME không nằm trong allowlist của kind (ASSET_001)', () => {
    const result = validateFile({ kind: 'IMAGE', mime: 'application/x-msdownload', size: 1024 });

    expect(result).toEqual({ ok: false, code: 'ASSET_001', message: 'Định dạng không hỗ trợ' });
  });

  it('từ chối tệp vượt trần dung lượng của kind (ASSET_002)', () => {
    const result = validateFile({ kind: 'IMAGE', mime: 'image/jpeg', size: 21 * 1024 * 1024 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ASSET_002');
      expect(result.message).toContain('20 MB');
    }
  });

  it('từ chối voice note vượt maxSeconds (ASSET_006)', () => {
    const result = validateFile({
      kind: 'VOICE',
      mime: 'audio/mp4',
      size: 1024,
      durationMs: 301_000,
    });

    expect(result).toEqual({
      ok: false,
      code: 'ASSET_006',
      message: 'Ghi âm vượt quá thời lượng cho phép',
    });
  });

  it('chấp nhận tệp hợp lệ trong allowlist và dưới trần', () => {
    expect(validateFile({ kind: 'FILE', mime: 'application/pdf', size: 1024 })).toEqual({ ok: true });
  });

  it('từ chối size 0 (không đo được tệp) — BE bắt `size` là số nguyên dương, gửi 0 là `400 VAL_001`', () => {
    expect(validateFile({ kind: 'IMAGE', mime: 'image/jpeg', size: 0 })).toEqual({
      ok: false,
      code: 'ASSET_007',
      message: 'Không đọc được tệp này',
    });
  });

  it('`audio/m4a` KHÔNG hợp lệ cho VOICE (BE chỉ nhận `audio/mp4`) — chuẩn hoá phải chạy TRƯỚC khi kiểm', () => {
    expect(validateFile({ kind: 'VOICE', mime: 'audio/m4a', size: 1024 }).ok).toBe(false);
    expect(validateFile({ kind: 'VOICE', mime: 'audio/mp4', size: 1024 }).ok).toBe(true);
  });

  it('đọc `capabilities.upload.kinds` khi BE có trả (mở rộng ngoài kiểu Capabilities hiện tại)', () => {
    const capabilities = {
      version: '1.0.0',
      features: {},
      limits: {},
      upload: {
        maxFileBytes: 999,
        allowedMime: [],
        signedUrlTtlSeconds: 60,
        kinds: { IMAGE: { maxBytes: 5, mime: ['image/png'] } },
      },
    } as never;

    const result = validateFile({ kind: 'IMAGE', mime: 'image/jpeg', size: 1 }, capabilities);

    // Server ghi đè allowlist mặc định — jpeg không còn trong danh sách [png].
    expect(result).toEqual({ ok: false, code: 'ASSET_001', message: 'Định dạng không hỗ trợ' });
  });

  it('KHÔNG throw khi capabilities thiếu `upload.kinds` — rơi về mặc định', () => {
    const capabilities = {
      version: '1.0.0',
      features: {},
      limits: {},
      upload: { maxFileBytes: 999, allowedMime: [], signedUrlTtlSeconds: 60 },
    } as never;

    expect(() => resolveKindLimit('FILE', capabilities)).not.toThrow();
    expect(validateFile({ kind: 'FILE', mime: 'application/pdf', size: 1 }, capabilities)).toEqual({
      ok: true,
    });
  });
});

describe('guessKindFromMime', () => {
  it.each([
    ['image/png', 'IMAGE'],
    ['video/mp4', 'VIDEO'],
    ['audio/aac', 'AUDIO'],
    ['application/pdf', 'FILE'],
    ['', 'FILE'],
  ] as const)('%s → %s', (mime, expected) => {
    expect(guessKindFromMime(mime)).toBe(expected);
  });
});

describe('assetErrorMessage', () => {
  it('trả câu tiếng Việt cho mã đã biết', () => {
    expect(assetErrorMessage('ASSET_002')).toBe('Tệp quá lớn');
  });

  it('trả câu chung khi mã không xác định hoặc thiếu', () => {
    expect(assetErrorMessage('ASSET_999')).toBe('Đã có lỗi xảy ra, thử lại');
    expect(assetErrorMessage(undefined)).toBe('Đã có lỗi xảy ra, thử lại');
  });
});
