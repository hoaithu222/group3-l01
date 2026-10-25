import { create } from 'zustand';

/**
 * Trạng thái GIAO DIỆN do chủ phòng tác động lên MÌNH (app.md §4, §5): bị chặn phát biểu, bị nhắc tắt mic, được mời phát biểu.
 * Tách khỏi `callStore` (tín hiệu có `version`) vì đây là lời nhắc cục bộ, mất khi rời phòng. Mount ở `CallHost` (qua
 * `useHostActionsListener`) nên nhận được cả khi màn phòng đang thu nhỏ; xoá khi ngắt media (`teardownCallSession`).
 */
export interface VoiceRoomUiState {
  /** Chủ phòng đã chặn mic của mình — nút mic khoá, kèm nhãn nói rõ lý do. Bỏ chặn KHÔNG bật lại mic (người dùng tự bật). */
  audioBlocked: boolean;
  /** `Date.now()` lúc được mời phát biểu; UI hiện lời mời + nút "Bật mic" tới khi người dùng xử lý. */
  inviteSpeakAt: number | null;
  /** `Date.now()` lúc chủ phòng đề nghị tắt mic; lời nhắc tự ẩn sau vài giây. */
  muteRequestAt: number | null;
  /** Kênh không còn cho video — ẩn nút camera. */
  videoDisabled: boolean;
}

interface VoiceRoomUiStore extends VoiceRoomUiState {
  patch: (partial: Partial<VoiceRoomUiState>) => void;
  reset: () => void;
}

const INITIAL: VoiceRoomUiState = { audioBlocked: false, inviteSpeakAt: null, muteRequestAt: null, videoDisabled: false };

export const useVoiceRoomStore = create<VoiceRoomUiStore>()((set) => ({
  ...INITIAL,
  patch: (partial) => set(partial),
  reset: () => set({ ...INITIAL }),
}));
