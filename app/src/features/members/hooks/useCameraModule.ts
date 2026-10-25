import { useEffect, useState } from 'react';

import { loadCameraModule, type CameraModule } from '../utils/load-camera-module';

export type CameraModuleState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { module: CameraModule; status: 'ready' };

/**
 * Nạp lười `expo-camera` (xem `load-camera-module.ts` — vì sao động). `unavailable` = bản cài đặt này KHÔNG có
 * module native (chưa build lại): trạng thái đó không tự hết khi thử lại, chỉ hết khi cài bản build mới, nên màn quét
 * chỉ chỉ đường sang nhập tay.
 *
 * ⚠️ Trả cả module (không phải riêng `CameraView`): `useCameraPermissions` cũng nằm trong đó, và cả hai phải lấy từ
 * CÙNG một lần nạp. Nơi dùng chỉ gọi hook của nó SAU khi `ready` (không bao giờ lúc `loading`), nên số hook mỗi lần vẽ
 * của component con luôn cố định.
 */
export function useCameraModule(): CameraModuleState {
  const [state, setState] = useState<CameraModuleState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void loadCameraModule().then((module) => {
      if (active) setState(module ? { module, status: 'ready' } : { status: 'unavailable' });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}
