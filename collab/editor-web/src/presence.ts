import { BRIDGE_LIMITS, type PresenceUser } from "./bridge-protocol";
import { clampText } from "./bridge-validate";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = "#175CD3";

/**
 * Trạng thái awareness (`Map<clientId, state>`) → danh sách người đang mở, MỖI NGƯỜI MỘT DÒNG (một người mở hai máy = một).
 * Mình đứng đầu, sau đó theo tên. State không có `user` hợp lệ (vd chỉ có `cursor`) bị bỏ qua. Dữ liệu người khác được làm sạch
 * lại dù server đã kiểm (tên ≤ 80 ký tự, màu `#RRGGBB`) vì đây là dữ liệu do máy khác gửi.
 */
export function presenceFromStates(states: ReadonlyMap<number, unknown>, selfId: string): PresenceUser[] {
  const byId = new Map<string, PresenceUser>();
  for (const state of states.values()) {
    if (typeof state !== "object" || state === null) continue;
    const user = (state as { user?: unknown }).user;
    if (typeof user !== "object" || user === null) continue;
    const { id, name, color } = user as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > 64) continue;
    const existing = byId.get(id);
    if (existing) continue;
    byId.set(id, {
      id,
      name: clampText(typeof name === "string" ? name.trim() : "", BRIDGE_LIMITS.maxNameChars) || "Người dùng",
      color: typeof color === "string" && COLOR_RE.test(color) ? color : FALLBACK_COLOR,
      self: id === selfId,
    });
  }
  return [...byId.values()].sort((a, b) => Number(b.self) - Number(a.self) || a.name.localeCompare(b.name, "vi"));
}
