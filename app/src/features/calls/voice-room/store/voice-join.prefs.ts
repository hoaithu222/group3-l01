/**
 * Trạng thái MODULE (không phải store React) của luồng vào phòng thoại:
 *  · `voiceJoinPrefs` — lựa chọn lúc bấm "Tham gia" ("để nghe" hay có mic, có bật camera không) chuyền cho `connectCallSession`: bộ điều
 *    khiển media chạy NGOÀI cây React (`useCallSession` gọi nó khi có token) nên không nhận được props. `take()` xoá sau khi dùng để lần
 *    vào sau (cuộc gọi RING) không thừa hưởng "chỉ nghe" của lần trước;
 *  · `voiceJoinAttempts` — `clientCallId` theo (kênh, loại) để thử lại thủ công sau mất mạng dùng LẠI cùng id (CL-09).
 *
 * ⚠️ Cả hai là dữ liệu của MỘT lượt người dùng ⇒ `resetVoiceJoinState()` được `resetCallStores()` gọi khi rời phiên (`wipeUserData`, bước
 * `calls`). Không ghi bền, không zustand nên `user-scoped-stores.manifest.test` không đòi khai riêng.
 */
export interface VoiceJoinPrefs {
  camera: boolean;
  /** "Tham gia để nghe": vào phòng KHÔNG xin quyền mic — chỉ xin khi người dùng bấm bật mic (VR-02, app.md §5). */
  listenOnly: boolean;
}

const DEFAULT_PREFS: VoiceJoinPrefs = { camera: false, listenOnly: false };

let current: VoiceJoinPrefs = DEFAULT_PREFS;
const attempts = new Map<string, string>();

export const voiceJoinPrefs = {
  set(next: VoiceJoinPrefs): void {
    current = next;
  },
  take(): VoiceJoinPrefs {
    const taken = current;
    current = DEFAULT_PREFS;
    return taken;
  },
};

export const voiceJoinAttempts = {
  delete: (key: string): void => void attempts.delete(key),
  get: (key: string): string | undefined => attempts.get(key),
  set: (key: string, clientCallId: string): void => void attempts.set(key, clientCallId),
};

export function resetVoiceJoinState(): void {
  current = DEFAULT_PREFS;
  attempts.clear();
}
