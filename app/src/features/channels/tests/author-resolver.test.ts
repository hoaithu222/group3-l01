import { buildAuthorResolver } from '../utils/author-resolver';

describe('buildAuthorResolver (kênh)', () => {
  const members = [
    { userId: 'u-1', name: 'Nguyễn Văn An', avatarUrl: 'https://cdn/an.png' },
    { userId: 'u-2', name: 'Trần Thị Bình' },
  ];

  it('tra tên và ảnh theo userId', () => {
    const resolve = buildAuthorResolver(members);
    expect(resolve('u-1')).toEqual({ name: 'Nguyễn Văn An', avatarUrl: 'https://cdn/an.png' });
    expect(resolve('u-2')).toEqual({ name: 'Trần Thị Bình', avatarUrl: null });
  });

  it('tác giả không còn trong kênh ⇒ undefined (chat tự hiện tên tối giản, không bịa tên)', () => {
    expect(buildAuthorResolver(members)('u-da-roi')).toBeUndefined();
  });

  it('chính mình là DỰ PHÒNG khi không nằm trong danh sách (xem kênh public chưa tham gia)', () => {
    const resolve = buildAuthorResolver(members, { id: 'me', name: 'Tôi', avatar: null });
    expect(resolve('me')).toEqual({ name: 'Tôi', avatarUrl: null });
  });

  it('đã có trong danh sách thì tên trong danh sách thắng dự phòng', () => {
    const resolve = buildAuthorResolver(members, { id: 'u-1', name: 'Tên tài khoản khác' });
    expect(resolve('u-1')?.name).toBe('Nguyễn Văn An');
  });
});
