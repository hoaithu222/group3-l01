import { useEffect, useState } from 'react';

import { loadSkiaModule, type SkiaModule } from '../canvas/skia-module';

export type SkiaModuleState =
  { status: 'loading' } | { status: 'unavailable' } | { module: SkiaModule; status: 'ready' };

/**
 * Trạng thái nạp lười Skia: `loading` → `ready` (có module để dựng canvas) hoặc `unavailable` (dev client chưa build lại với gói native — màn hiện
 * "bản cài đặt này chưa hỗ trợ bảng trắng"). Nạp SAU khi màn mở, không phải lúc khởi động app — lý do ở `canvas/skia-module.ts`.
 */
export function useSkiaModule(): SkiaModuleState {
  const [state, setState] = useState<SkiaModuleState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void loadSkiaModule().then((module) => {
      if (!cancelled) setState(module ? { module, status: 'ready' } : { status: 'unavailable' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
