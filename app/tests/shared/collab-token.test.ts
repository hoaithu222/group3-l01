import {
  CollabRefreshScheduler,
  CollabTokenProvider,
  isGrantFresh,
  parseCollabGrant,
  refreshDelayMs,
  type CollabGrant,
} from '@/shared/collab';

/**
 * Lớp cấp mã kết nối cộng tác dùng chung (p6-01): đọc phản hồi `collab-token` (hợp đồng `collab/README.md` §3.1), làm mới token trước hạn 60 s
 * (CW-D5), dồn lượt xin trùng (BE giới hạn 30 lần/phút) và không giữ token của phiên đã rời.
 */
const DOC = '0123456789abcdef01234567';
const NOW = 1_800_000_000_000;

function rawGrant(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentName: `doc:${DOC}`,
    expiresAt: new Date(NOW + 300_000).toISOString(),
    limits: { stateMaxBytes: 5_242_880 },
    mode: 'edit',
    token: 'header.payload.signature',
    url: 'wss://superapp.example.com/collab',
    user: { color: '#175CD3', id: 'u1', name: 'Lan' },
    ...over,
  };
}

function grant(expiresInMs: number): CollabGrant {
  return {
    documentName: `doc:${DOC}`,
    expiresAt: NOW + expiresInMs,
    mode: 'edit',
    token: `t-${expiresInMs}`,
    url: 'wss://x.example/collab',
    user: { color: '#175CD3', id: 'u1', name: 'Lan' },
  };
}

describe('parseCollabGrant', () => {
  it('phản hồi hợp lệ → grant với expiresAt là epoch ms và trần dung lượng', () => {
    expect(parseCollabGrant(rawGrant())).toEqual({
      documentName: `doc:${DOC}`,
      expiresAt: NOW + 300_000,
      mode: 'edit',
      stateMaxBytes: 5_242_880,
      token: 'header.payload.signature',
      url: 'wss://superapp.example.com/collab',
      user: { color: '#175CD3', id: 'u1', name: 'Lan' },
    });
  });

  it.each([
    ['url không phải ws/wss', { url: 'https://x.example/collab' }],
    ['documentName sai dạng', { documentName: 'doc:123' }],
    ['màu sai dạng', { user: { color: 'red', id: 'u1', name: 'Lan' } }],
    ['thiếu token', { token: '' }],
    ['mode lạ', { mode: 'comment' }],
    ['expiresAt không đọc được và token không phải JWT', { expiresAt: 'không-phải-ngày' }],
  ])('%s → null (không ném lỗi, không in nội dung)', (_name, over) => {
    expect(parseCollabGrant(rawGrant(over))).toBeNull();
  });

  it('không phải object → null', () => {
    expect(parseCollabGrant(null)).toBeNull();
    expect(parseCollabGrant('token')).toBeNull();
    expect(parseCollabGrant([])).toBeNull();
  });

  it('thiếu expiresAt thì đọc `exp` (giây) trong JWT', () => {
    const payload = Buffer.from(
      JSON.stringify({ exp: Math.floor((NOW + 120_000) / 1000) }),
    ).toString('base64url');
    const parsed = parseCollabGrant(rawGrant({ expiresAt: undefined, token: `h.${payload}.s` }));
    expect(parsed?.expiresAt).toBe(Math.floor((NOW + 120_000) / 1000) * 1000);
  });
});

describe('hẹn giờ làm mới', () => {
  it('refreshDelayMs = expiresAt − 60 s − now, không dưới 1 s', () => {
    expect(refreshDelayMs(NOW + 300_000, NOW)).toBe(240_000);
    expect(refreshDelayMs(NOW + 30_000, NOW)).toBe(1_000);
    expect(refreshDelayMs(NOW - 5_000, NOW)).toBe(1_000);
  });

  it('isGrantFresh: còn hơn 60 s mới coi là còn mới', () => {
    expect(isGrantFresh({ expiresAt: NOW + 61_000 }, NOW)).toBe(true);
    expect(isGrantFresh({ expiresAt: NOW + 60_000 }, NOW)).toBe(false);
  });
});

describe('CollabTokenProvider', () => {
  it('nhiều nơi cùng xin → MỘT lượt gọi BE (single-flight)', async () => {
    const fetchGrant = jest.fn().mockResolvedValue(grant(300_000));
    const provider = new CollabTokenProvider(fetchGrant, () => NOW);
    const [a, b] = await Promise.all([provider.refresh(), provider.refresh()]);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    await provider.refresh();
    expect(fetchGrant).toHaveBeenCalledTimes(2);
  });

  it('ensure dùng lại bản còn mới, xin mới khi sắp hết hạn', async () => {
    const fetchGrant = jest
      .fn()
      .mockResolvedValueOnce(grant(300_000))
      .mockResolvedValueOnce(grant(600_000));
    let now = NOW;
    const provider = new CollabTokenProvider(fetchGrant, () => now);
    await provider.ensure();
    await provider.ensure();
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    now = NOW + 250_000;
    expect((await provider.ensure()).token).toBe('t-600000');
  });

  it('lỗi từ BE ném cho nơi gọi và lượt sau xin lại được', async () => {
    const fetchGrant = jest
      .fn()
      .mockRejectedValueOnce(new Error('mạng'))
      .mockResolvedValueOnce(grant(300_000));
    const provider = new CollabTokenProvider(fetchGrant, () => NOW);
    await expect(provider.refresh()).rejects.toThrow('mạng');
    await expect(provider.refresh()).resolves.toMatchObject({ token: 't-300000' });
  });

  it('clear() — kết quả của lượt gọi đang bay KHÔNG được ghi lại vào bộ nhớ', async () => {
    let release: (g: CollabGrant) => void = () => undefined;
    const provider = new CollabTokenProvider(
      () => new Promise<CollabGrant>((resolve) => (release = resolve)),
      () => NOW,
    );
    const pending = provider.refresh();
    provider.clear();
    release(grant(300_000));
    await pending;
    expect(provider.current).toBeNull();
  });
});

describe('CollabRefreshScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('làm mới đúng lúc còn 60 s rồi hẹn tiếp theo hạn của token mới', async () => {
    const provider = new CollabTokenProvider(
      jest.fn().mockResolvedValue(grant(300_000)),
      () => NOW,
    );
    const onGrant = jest.fn();
    const scheduler = new CollabRefreshScheduler({ now: () => NOW, onGrant, provider });
    scheduler.start(grant(300_000));

    await jest.advanceTimersByTimeAsync(239_999);
    expect(onGrant).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(onGrant).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('lỗi mạng → thử lại sau 5 s; stop() dừng hẳn', async () => {
    const fetchGrant = jest
      .fn()
      .mockRejectedValueOnce(new Error('mạng'))
      .mockResolvedValue(grant(300_000));
    const provider = new CollabTokenProvider(fetchGrant, () => NOW);
    const onGrant = jest.fn();
    const scheduler = new CollabRefreshScheduler({ now: () => NOW, onGrant, provider });
    scheduler.start(grant(61_000));

    await jest.advanceTimersByTimeAsync(1_000);
    expect(fetchGrant).toHaveBeenCalledTimes(1);
    expect(onGrant).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(onGrant).toHaveBeenCalledTimes(1);

    scheduler.stop();
    await jest.advanceTimersByTimeAsync(600_000);
    expect(fetchGrant).toHaveBeenCalledTimes(2);
  });
});

describe('parseCollabGrant — bảng trắng (p6-02)', () => {
  const wb = (over: Record<string, unknown> = {}) =>
    rawGrant({ documentName: `wb:${DOC}`, limits: { elementsMax: 5000, stateMaxBytes: 9_437_184 }, ...over });

  it('kind "wb" nhận `wb:<id>` và đọc trần số phần tử; mặc định (doc) từ chối tiền tố lạ', () => {
    expect(parseCollabGrant(wb(), 'wb')).toMatchObject({
      documentName: `wb:${DOC}`,
      elementsMax: 5000,
      stateMaxBytes: 9_437_184,
    });
    expect(parseCollabGrant(wb())).toBeNull();
    expect(parseCollabGrant(rawGrant(), 'wb')).toBeNull();
  });

  it('`elementsMax` sai kiểu/âm bị bỏ chứ không làm hỏng cả grant', () => {
    expect(parseCollabGrant(wb({ limits: { elementsMax: -1 } }), 'wb')).not.toHaveProperty(
      'elementsMax',
    );
    expect(parseCollabGrant(wb({ limits: { elementsMax: '5000' } }), 'wb')).not.toHaveProperty(
      'elementsMax',
    );
  });
});
