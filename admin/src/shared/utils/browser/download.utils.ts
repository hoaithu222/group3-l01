/**
 * @file download.utils.ts
 * @description Helper tải file từ presigned URL — ép trình duyệt TẢI (không mở tab).
 */

/** Suy ra tên file từ presigned URL (Content-Disposition hoặc path cuối). */
export const deriveFileName = (url: string): string => {
  try {
    const u = new URL(url);
    const cd = u.searchParams.get('response-content-disposition');
    const match = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(cd);
    if (match?.[1]) return decodeURIComponent(match[1]);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    // URL không hợp lệ → dùng tên mặc định.
  }
  return 'download';
};

/**
 * Ép trình duyệt TẢI file. Presigned URL khác origin → `download` attr bị bỏ
 * qua (trình duyệt mở/điều hướng sang URL). Fetch → blob (cùng origin) để ép
 * tải; CORS chặn fetch thì fallback mở tab mới.
 */
export const triggerBrowserDownload = async (url: string): Promise<void> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = deriveFileName(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
};
