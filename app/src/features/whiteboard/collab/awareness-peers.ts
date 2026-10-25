import type { Vec2 } from '../engine';

/** Một client khác đang mở bảng (một người nhiều máy = nhiều peer, cùng `id`). */
export interface RemotePeer {
  clientId: number;
  /** `#RRGGBB` do BE cấp qua `collab-token.user.color`; `null` nếu state lạ — nơi vẽ rơi về màu chữ phụ của theme. */
  color: string | null;
  id: string;
  name: string;
  pointer: Vec2 | null;
  selection: string[];
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const NAME_MAX = 80;
const SELECTION_MAX = 50;

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNum = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readPointer(value: unknown): Vec2 | null {
  return isObj(value) && isNum(value['x']) && isNum(value['y']) ? { x: value['x'], y: value['y'] } : null;
}

/**
 * Trạng thái awareness của người khác → danh sách peer. Dữ liệu tới từ máy khác nên coi là KHÔNG tin cậy: state thiếu `user`/`id`, sai kiểu,
 * hoặc là chính mình (`selfClientId`) bị bỏ; tên cắt ở 80 ký tự; toạ độ không hữu hạn (NaN/Infinity làm vỡ phép vẽ) → không có con trỏ.
 * Sắp theo `clientId` để thứ tự ổn định giữa các lần đọc (danh sách avatar không nhảy).
 */
export function readPeers(
  states: ReadonlyMap<number, Obj>,
  selfClientId: number,
): RemotePeer[] {
  const peers: RemotePeer[] = [];
  for (const [clientId, state] of states) {
    if (clientId === selfClientId || !isObj(state)) continue;
    const user = state['user'];
    if (!isObj(user) || typeof user['id'] !== 'string' || user['id'] === '') continue;
    const name = typeof user['name'] === 'string' ? user['name'].trim().slice(0, NAME_MAX) : '';
    const color = typeof user['color'] === 'string' && COLOR_RE.test(user['color']) ? user['color'] : null;
    const selection = Array.isArray(state['selection'])
      ? state['selection'].filter((id): id is string => typeof id === 'string').slice(0, SELECTION_MAX)
      : [];
    peers.push({
      clientId,
      color,
      id: user['id'],
      name: name || 'Người dùng',
      pointer: readPointer(state['pointer']),
      selection,
    });
  }
  return peers.sort((a, b) => a.clientId - b.clientId);
}

/** Chữ ký danh tính (bỏ toạ độ) — đổi khi có người vào/ra/đổi tên, KHÔNG đổi khi chỉ con trỏ nhúc nhích. */
export const identityKey = (peers: readonly RemotePeer[]): string =>
  peers.map((peer) => `${peer.clientId}:${peer.id}:${peer.name}:${peer.color ?? ''}`).join('|');

/** Mỗi NGƯỜI một dòng (bỏ chính mình theo `id`) — cho dải avatar; nhiều máy của một người chỉ tính một. */
export function uniqueUsers(
  peers: readonly RemotePeer[],
  selfUserId: string | undefined,
): { color: string | null; id: string; name: string }[] {
  const seen = new Set<string>();
  const out: { color: string | null; id: string; name: string }[] = [];
  for (const peer of peers) {
    if (peer.id === selfUserId || seen.has(peer.id)) continue;
    seen.add(peer.id);
    out.push({ color: peer.color, id: peer.id, name: peer.name });
  }
  return out;
}
