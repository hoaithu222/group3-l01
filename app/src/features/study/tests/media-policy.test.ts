import { checkStudyFile, normalizeAudioMime, toJpegName } from '../utils/media-policy';

/**
 * Luật ảnh/âm thanh của scope `STUDY` (BE `LIMITS.upload.scopeRestrict.STUDY`, be.md p4-01 §13.12): ảnh JPEG/PNG/WebP ≤ 5 MiB,
 * âm thanh CHỈ `audio/mpeg` và `audio/mp4` ≤ 10 MiB. Sai MIME là `ASSET_001` dù tệp hợp lệ — nên MIME máy báo phải được quy về đúng
 * hai giá trị BE nhận.
 */
const MIB = 1024 * 1024;

describe('normalizeAudioMime', () => {
  it.each([
    ['audio/mpeg', 'a.mp3', 'audio/mpeg'],
    ['audio/mp3', 'a.mp3', 'audio/mpeg'],
    ['audio/x-m4a', 'a.m4a', 'audio/mp4'],
    ['audio/m4a', 'a.m4a', 'audio/mp4'],
    ['audio/mp4', 'a.m4a', 'audio/mp4'],
    ['AUDIO/X-M4A', 'a.m4a', 'audio/mp4'],
  ])('%s → %s', (mime, name, expected) => {
    expect(normalizeAudioMime(mime, name)).toBe(expected);
  });

  it('tệp từ Drive/Zalo không có MIME (rỗng/octet-stream) thì dựa vào đuôi tên tệp', () => {
    expect(normalizeAudioMime('application/octet-stream', 'Bai hat.MP3')).toBe('audio/mpeg');
    expect(normalizeAudioMime('', 'ghi-am.m4a')).toBe('audio/mp4');
    expect(normalizeAudioMime('', 'ghi-am.wav')).toBeNull();
  });

  it('MIME nói rõ là định dạng khác thì từ chối dù đuôi tên nói dối', () => {
    expect(normalizeAudioMime('audio/wav', 'a.mp3')).toBeNull();
    expect(normalizeAudioMime('video/mp4', 'a.m4a')).toBeNull();
  });
});

describe('checkStudyFile', () => {
  it('ảnh hợp lệ ⇒ null; GIF/HEIC bị chặn (scope siết chặt)', () => {
    expect(checkStudyFile('IMAGE', 'image/jpeg', 1 * MIB)).toBeNull();
    expect(checkStudyFile('IMAGE', 'image/webp', 1 * MIB)).toBeNull();
    expect(checkStudyFile('IMAGE', 'image/gif', 1 * MIB)).toMatch(/JPEG, PNG hoặc WebP/);
    expect(checkStudyFile('IMAGE', 'image/heic', 1 * MIB)).not.toBeNull();
  });

  it('trần 5 MB cho ảnh, 10 MB cho âm thanh — đúng ranh giới', () => {
    expect(checkStudyFile('IMAGE', 'image/jpeg', 5 * MIB)).toBeNull();
    expect(checkStudyFile('IMAGE', 'image/jpeg', 5 * MIB + 1)).toMatch(/quá lớn/);
    expect(checkStudyFile('AUDIO', 'audio/mpeg', 10 * MIB)).toBeNull();
    expect(checkStudyFile('AUDIO', 'audio/mp4', 10 * MIB + 1)).toMatch(/quá lớn/);
  });

  it('kích thước 0 (máy không báo, đo không được) ⇒ lỗi, không gửi asset rỗng lên BE', () => {
    expect(checkStudyFile('AUDIO', 'audio/mpeg', 0)).toMatch(/Không đọc được/);
  });

  it('âm thanh chỉ nhận đúng hai MIME BE nhận', () => {
    expect(checkStudyFile('AUDIO', 'audio/x-m4a', MIB)).toMatch(/MP3 hoặc M4A/);
    expect(checkStudyFile('AUDIO', 'audio/wav', MIB)).not.toBeNull();
  });
});

describe('toJpegName', () => {
  it('đổi đuôi (ảnh luôn nén ra JPEG), giữ phần tên', () => {
    expect(toJpegName('IMG_2041.HEIC')).toBe('IMG_2041.jpg');
    expect(toJpegName('a.b.png')).toBe('a.b.jpg');
    expect(toJpegName('khongduoi')).toBe('khongduoi.jpg');
    expect(toJpegName('.png')).toBe('anh.jpg');
  });
});
