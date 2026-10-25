import { memo, useEffect, type ReactNode } from 'react';
import { useDisplayStore } from '../store';

/**
 * Áp chế độ hiển thị lên `documentElement`:
 *
 *  - class `.tv`   → mở khoá variant `tv:` trong Tailwind (`globals.css`)
 *  - `--ui-scale`  → nhân vào token TYPOGRAPHY trong `generated-font.css`
 *
 * ⛔ `--ui-scale` KHÔNG áp vào root font-size. Làm vậy sẽ kéo theo mọi utility
 * spacing/size (Tailwind v4 để `--spacing` theo rem) và làm vỡ bố cục — đó là
 * lỗi của bản đầu. Nay chỉ chữ to lên, khung giữ nguyên.
 *
 * KHÔNG đụng class `dark` — class đó do `ThemeProvider` sở hữu độc quyền (nó có
 * tính cả điều kiện "TV ép dark"). Hai provider ghi cùng một class sẽ đá nhau
 * theo thứ tự effect.
 */
/**
 * Giãn dòng tăng bao nhiêu phần so với cỡ chữ.
 *
 * `0.5` = nửa nhịp: chữ +30% thì dòng chỉ +15%. Đủ để chữ không dính nhau mà
 * không đẩy dòng ra khỏi các ô cao cố định (`h-6`/`h-7`/`h-8`).
 * `1` = cùng nhịp (gây tràn — đã thử và hỏng) · `0` = dòng đứng yên hoàn toàn.
 */
const LINE_HEIGHT_DAMPING = 0.5;

const DisplayProvider = ({ children }: { children: ReactNode }) => {
  const mode = useDisplayStore((s) => s.mode);
  const uiScale = useDisplayStore((s) => s.uiScale);

  useEffect(() => {
    const root = document.documentElement;
    const isTv = mode === 'tv';

    const scale = isTv ? uiScale : 1;

    root.classList.toggle('tv', isTv);
    // Ở chế độ standard luôn ghi `1` — KHÔNG xoá property, vì để trống thì
    // fallback nằm rải rác ở nhiều `var(--ui-scale, 1)` khác nhau, khó truy.
    root.style.setProperty('--ui-scale', String(scale));

    // Giãn dòng chỉ tăng NỬA nhịp so với cỡ chữ. Rất nhiều ô có chiều cao cố
    // định vừa khít một dòng (`h-6`/`h-7`/`h-8`); giãn dòng tăng đủ nhịp sẽ đẩy
    // dòng cao hơn ô và chữ tràn/đè lên nhau ở MỌI màn cùng lúc.
    // Tính ở đây (không phải trong CSS) để chỉ có MỘT nguồn công thức.
    root.style.setProperty('--lh-scale', String(1 + (scale - 1) * LINE_HEIGHT_DAMPING));
  }, [mode, uiScale]);

  return <>{children}</>;
};

export default memo(DisplayProvider);
