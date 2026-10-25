import { create } from 'zustand';

interface VoicePlayerStoreShape {
  /** `assetId` đang phát — `null` = không có player nào đang phát. */
  playingAssetId: string | null;
  setPlaying: (assetId: string | null) => void;
}

/** "Một player phát tại một thời điểm" (app.md §5) — mỗi `VoiceNotePlayer` tự pause khi KHÔNG phải chủ của mốc này. */
export const useVoicePlayerStore = create<VoicePlayerStoreShape>((set) => ({
  playingAssetId: null,
  setPlaying: (assetId) => set({ playingAssetId: assetId }),
}));
