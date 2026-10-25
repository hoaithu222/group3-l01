import { identityKey, readPeers, uniqueUsers } from '../collab/awareness-peers';

type States = Map<number, Record<string, unknown>>;
const user = (id: string, name = 'Lan', color: unknown = '#175CD3') => ({
  user: { color, id, name },
});

describe('readPeers — dữ liệu từ máy khác KHÔNG đáng tin', () => {
  it('bỏ chính mình (clientID), state thiếu user/id, và sắp theo clientId', () => {
    const states: States = new Map<number, Record<string, unknown>>([
      [9, user('u9')],
      [1, user('u1')],
      [2, {}],
      [3, { user: { name: 'thiếu id' } }],
      [4, { user: { id: '', name: 'id rỗng' } }],
      [5, user('u5')],
    ]);
    expect(readPeers(states, 1).map((p) => p.clientId)).toEqual([5, 9]);
  });

  it('con trỏ không hữu hạn/sai kiểu → null (NaN/Infinity làm vỡ phép vẽ); hợp lệ thì giữ', () => {
    const states: States = new Map([
      [2, { ...user('a'), pointer: { x: 10, y: 20 } }],
      [3, { ...user('b'), pointer: { x: Infinity, y: 1 } }],
      [4, { ...user('c'), pointer: { x: '1', y: 2 } }],
      [5, { ...user('d'), pointer: 'lạ' }],
    ]);
    const byId = Object.fromEntries(readPeers(states, 1).map((p) => [p.id, p.pointer]));
    expect(byId).toEqual({ a: { x: 10, y: 20 }, b: null, c: null, d: null });
  });

  it('màu sai định dạng → null (nơi vẽ rơi về màu theme); tên cắt 80 ký tự, trống → "Người dùng"', () => {
    const states: States = new Map([
      [2, user('a', 'x'.repeat(200), 'red')],
      [3, user('b', '   ', '#AABBCC')],
    ]);
    const [a, b] = readPeers(states, 1);
    expect(a?.color).toBeNull();
    expect(a?.name).toHaveLength(80);
    expect(b?.color).toBe('#AABBCC');
    expect(b?.name).toBe('Người dùng');
  });

  it('selection chỉ nhận chuỗi và cắt 50 id', () => {
    const states: States = new Map([
      [
        2,
        {
          ...user('a'),
          selection: [1, 'x', null, ...Array.from({ length: 80 }, (_, i) => `e${i}`)],
        },
      ],
    ]);
    const [peer] = readPeers(states, 1);
    expect(peer?.selection).toHaveLength(50);
    expect(peer?.selection[0]).toBe('x');
  });
});

describe('identityKey / uniqueUsers', () => {
  const peers = readPeers(
    new Map<number, Record<string, unknown>>([
      [2, { ...user('a'), pointer: { x: 1, y: 1 } }],
      [3, { ...user('a'), pointer: { x: 9, y: 9 } }],
      [4, user('me')],
      [5, user('b', 'Minh')],
    ]),
    1,
  );

  it('chữ ký danh tính KHÔNG đổi khi chỉ con trỏ nhúc nhích, đổi khi có người vào/ra', () => {
    const moved = peers.map((p) => (p.pointer ? { ...p, pointer: { x: 0, y: 0 } } : p));
    expect(identityKey(moved)).toBe(identityKey(peers));
    expect(identityKey(peers.slice(1))).not.toBe(identityKey(peers));
  });

  it('mỗi NGƯỜI một dòng (nhiều máy gộp), bỏ chính mình theo id', () => {
    expect(uniqueUsers(peers, 'me').map((u) => u.id)).toEqual(['a', 'b']);
    expect(uniqueUsers(peers, undefined).map((u) => u.id)).toEqual(['a', 'me', 'b']);
  });
});
