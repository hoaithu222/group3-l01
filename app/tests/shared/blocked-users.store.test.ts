import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import { useModerationIntentStore } from '@/shared/stores/moderation-intent.store';
import { resetModerationStores } from '@/shared/stores/reset-moderation-stores';

/**
 * Store CHUNG "ai bị mình chặn" (p1-08): `chat`/`conversations`/`members` chỉ ĐỌC nó, nên hợp đồng của nó là
 * hợp đồng giữa các feature — tập bất biến (selector chỉ đổi khi tập thật sự đổi), `hydrate` thay TOÀN BỘ,
 * và `reset` khi đăng xuất không để lọt danh sách của người trước sang người sau.
 */
describe('useBlockedUsersStore', () => {
  beforeEach(() => resetModerationStores());

  it('mặc định rỗng và CHƯA hydrate (phân biệt "chưa biết" với "không chặn ai")', () => {
    const state = useBlockedUsersStore.getState();
    expect(state.ids.size).toBe(0);
    expect(state.hydrated).toBe(false);
  });

  it('hydrate thay TOÀN BỘ tập theo bản server (id đã bỏ chặn ở máy khác biến mất), kể cả tập rỗng', () => {
    const { hydrate } = useBlockedUsersStore.getState();
    hydrate(['a', 'b']);
    expect([...useBlockedUsersStore.getState().ids].sort()).toEqual(['a', 'b']);

    hydrate(['b', 'c']);
    expect([...useBlockedUsersStore.getState().ids].sort()).toEqual(['b', 'c']);

    hydrate([]);
    expect(useBlockedUsersStore.getState().ids.size).toBe(0);
    expect(useBlockedUsersStore.getState().hydrated).toBe(true);
  });

  it('add/remove tạo Set MỚI (bất biến) và idempotent — không đổi tham chiếu khi không có gì đổi', () => {
    const store = useBlockedUsersStore.getState();
    store.hydrate(['a']);
    const before = useBlockedUsersStore.getState().ids;

    store.add('a');
    expect(useBlockedUsersStore.getState().ids).toBe(before);
    store.remove('zzz');
    expect(useBlockedUsersStore.getState().ids).toBe(before);

    store.add('b');
    const afterAdd = useBlockedUsersStore.getState().ids;
    expect(afterAdd).not.toBe(before);
    expect(before.has('b')).toBe(false);
    expect(afterAdd.has('b')).toBe(true);

    store.remove('a');
    expect(useBlockedUsersStore.getState().ids.has('a')).toBe(false);
  });

  it('resetModerationStores (đăng xuất) xoá cả danh sách chặn lẫn tấm Báo cáo/Chặn đang mở', () => {
    useBlockedUsersStore.getState().hydrate(['a']);
    useModerationIntentStore.getState().requestReport({ targetType: 'CHANNEL', targetId: 'ch-1' });
    useModerationIntentStore.getState().requestBlock({ userId: 'a', mode: 'block' });

    resetModerationStores();

    expect(useBlockedUsersStore.getState().ids.size).toBe(0);
    expect(useBlockedUsersStore.getState().hydrated).toBe(false);
    expect(useModerationIntentStore.getState().report).toBeNull();
    expect(useModerationIntentStore.getState().block).toBeNull();
  });
});
