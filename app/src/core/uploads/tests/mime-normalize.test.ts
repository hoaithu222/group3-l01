import { isHeicMime, normalizeMime } from '../mime-normalize';

/**
 * BE so MIME khai báo với allowlist THEO NGUYÊN VĂN (`LIMITS.upload.kinds`): sai một ký tự là `400 VAL_001` dù tệp hợp lệ. Các MIME
 * dưới đây là những gì trình chọn tệp Android/iOS thật sự báo.
 */
describe('normalizeMime', () => {
  it.each([
    ['image/jpg', 'a.jpg', 'image/jpeg'],
    ['image/heif', 'a.heic', 'image/heic'],
    ['audio/m4a', 'voice.m4a', 'audio/mp4'],
    ['audio/x-m4a', 'voice.m4a', 'audio/mp4'],
    ['audio/mp4a-latm', 'voice.m4a', 'audio/mp4'],
    ['audio/mp3', 'song.mp3', 'audio/mpeg'],
    ['AUDIO/X-WAV', 'a.wav', 'audio/wav'],
    ['application/x-zip-compressed', 'a.zip', 'application/zip'],
    ['text/plain; charset=utf-8', 'a.txt', 'text/plain'],
    ['text/comma-separated-values', 'a.csv', 'text/csv'],
  ])('%s → chuẩn hoá về MIME BE nhận', (input, name, expected) => {
    expect(normalizeMime(input, name)).toBe(expected);
  });

  it('MIME đã chuẩn giữ nguyên (không đụng tới cái BE đã nhận)', () => {
    expect(normalizeMime('image/png', 'a.png')).toBe('image/png');
    expect(normalizeMime('audio/mp4', 'a.m4a')).toBe('audio/mp4');
    expect(normalizeMime('application/pdf', 'a.pdf')).toBe('application/pdf');
  });

  it.each([undefined, null, '', 'application/octet-stream'])('máy không báo được MIME (%p) → suy từ đuôi tệp', (unknown) => {
    expect(normalizeMime(unknown, 'ghi-am.M4A')).toBe('audio/mp4');
    expect(normalizeMime(unknown, 'Bao-cao.PDF')).toBe('application/pdf');
    expect(normalizeMime(unknown, 'anh.jpeg')).toBe('image/jpeg');
  });

  it('không suy được (đuôi lạ/không đuôi) thì giữ nguyên để BE quyết định', () => {
    expect(normalizeMime('application/octet-stream', 'tep.xyz')).toBe('application/octet-stream');
    expect(normalizeMime(undefined, 'khong-duoi')).toBe('');
  });

  it('tệp `.heif` chỉ báo `application/octet-stream` (Drive/Zalo) → `image/heic`, để lớp chọn tệp còn nhận ra mà đổi sang JPEG', () => {
    expect(normalizeMime('application/octet-stream', 'IMG_0001.HEIF')).toBe('image/heic');
  });
});

describe('isHeicMime', () => {
  it.each(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])('%s → HEIC (BE không giải mã được)', (mime) => {
    expect(isHeicMime(mime)).toBe(true);
  });

  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf', ''])('%p → không phải HEIC', (mime) => {
    expect(isHeicMime(mime)).toBe(false);
  });
});
