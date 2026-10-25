import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/shared/utils/style/cn';
import { useElementSize } from '@/shared/hooks';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import type { AnnotationResult, Shape } from './image-annotator';
import Spinner from '@/shared/ui/feedback/Spinner';

/**
 * Lớp vẽ chú thích nạp LƯỜI.
 *
 * `image-annotator/` là ~1.3k dòng thao tác canvas, nhưng chỉ chạy khi người
 * dùng bấm nút bút chì. Import tĩnh thì nó nằm trong chunk `kit2` mà MỌI màn
 * hình đều tải — trả tiền băng thông cho một tính năng hiếm dùng.
 *
 * `lazy()` gọi ở module scope (không phải trong component) để identity của
 * component không đổi giữa các lần render — nếu không, React thấy đổi kiểu
 * phần tử và unmount lại toàn bộ khung vẽ mỗi lượt render.
 */
const AnnotationLayer = lazy(() =>
  import('./image-annotator').then((m) => ({ default: m.AnnotationLayer })),
);

/**
 * ImageLightbox — fullscreen image viewer with rotate/zoom controls.
 * Mirrors Ant Design Image preview UX.
 *
 * ⚠️ Zoom đổi KÍCH THƯỚC BỐ CỤC của ảnh, KHÔNG dùng `transform: scale`.
 * `transform` phóng to lớp ảnh ĐÃ raster ở cỡ vừa khung → phóng lên là vỡ hạt
 * dù tệp gốc còn thừa chi tiết (đúng lỗi "zoom bị vỡ ảnh" được báo). Đổi
 * width/height thì trình duyệt lấy nét lại từ bitmap gốc. `transform` chỉ còn
 * dùng cho XOAY.
 *
 * Truyền `annotation` → toolbar có thêm nút bút chì: chuyển sang chế độ vẽ (khoanh đỏ /
 * ghi chữ) NGAY trong khung xem này, dùng chung zoom/xoay/cuộn — xem `AnnotationLayer`.
 *
 * Usage:
 *   <ImageLightbox open={open} src="..." alt="..." onOpenChange={setOpen} />
 */

/**
 * Điều hướng giữa nhiều ảnh trong CÙNG một khung xem. Bỏ trống = 1 ảnh như cũ.
 *
 * ⛔ Caller giữ danh sách và chỉ số, component chỉ phát lệnh — có nơi cần quay vòng,
 * có nơi cần dừng ở hai đầu, và danh sách thường đã được lọc sẵn (vd bỏ video).
 */
export interface ImageLightboxNavigation {
  /** Vị trí ảnh đang xem (0-based) — dùng hiện "3 / 12". */
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

/** Cấu hình chế độ chú thích. Bỏ trống = lightbox chỉ để xem như cũ. */
export interface ImageAnnotationConfig {
  /** Ảnh GỐC chưa nét vẽ (nguồn để vẽ lại). `null` = caller đang tải về. */
  source: Blob | null;
  fileName: string;
  /** Nét đã vẽ lần trước — mở lại là sửa tiếp. */
  initialShapes?: Shape[];
  /** Caller đang upload/lưu → khoá nút. */
  saving?: boolean;
  onSave: (result: AnnotationResult) => void;
}

export interface ImageLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  alt?: string;
  /** `video` → render `<video controls>` thay `<img>`, ẩn toolbar xoay/zoom (video đã có control riêng). Mặc định `image`. */
  kind?: 'image' | 'video';
  /** Có giá trị → hiện nút tải cạnh nút đóng. Không truyền = ẩn (giữ nguyên hành vi cũ cho caller có sẵn). */
  onDownload?: () => void;
  /** Bật khả năng chú thích lên ảnh ngay trong khung xem này. */
  annotation?: ImageAnnotationConfig;
  /**
   * Nút RIÊNG của màn gọi, chèn vào cuối thanh công cụ (sau nút chú thích).
   *
   * Vì sao là slot chứ không phải thêm prop cho từng loại nút: mỗi màn cần một việc khác nhau
   * lên ảnh của nó (sửa khung đóng dấu ở nghiệm thu, sau này có thể là gắn thẻ / xoay lưu…),
   * mà lightbox thì không nên biết những việc đó là gì.
   *
   * Ẩn khi đang vẽ chú thích — lúc đó thanh công cụ thuộc về trình vẽ.
   */
  actions?: React.ReactNode;
  /** Có giá trị → hiện nút ‹ › + đếm "3 / 12", và bắt phím ←/→. */
  navigation?: ImageLightboxNavigation;
}

const EMPTY_SHAPES: Shape[] = [];

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

function clamp(val: number, min: number, max: number) {
  return Math.min(max, Math.max(min, val));
}

/** Kích thước hiển thị của ảnh ở mức zoom hiện tại + hộp bao sau khi xoay. */
function layoutImage(
  natural: { w: number; h: number } | null,
  box: { width: number; height: number },
  scale: number,
  rotation: number,
) {
  if (!natural || box.width <= 0 || box.height <= 0) return null;
  // "Vừa khung" = thu nhỏ cho lọt, KHÔNG phóng ảnh nhỏ lên (100% là trần của
  // mức zoom 1× — giống trình xem ảnh của hệ điều hành).
  const fit = Math.min(box.width / natural.w, box.height / natural.h, 1);
  const width = Math.round(natural.w * fit * scale);
  const height = Math.round(natural.h * fit * scale);
  // Xoay 90°/270° → hộp bao đổi chiều, nếu không ảnh bị cắt hai bên.
  const quarterTurn = Math.abs(rotation / 90) % 2 === 1;
  return {
    width,
    height,
    boxWidth: quarterTurn ? height : width,
    boxHeight: quarterTurn ? width : height,
  };
}

// ── Toolbar button ────────────────────────────────────────────────────────────

/**
 * Nút của thanh công cụ. XUẤT ra ngoài để nút do màn gọi truyền qua `actions` trông y hệt các
 * nút có sẵn — thanh công cụ này nằm nổi trên nền ảnh, một nút lệch kiểu là nhìn ra ngay.
 */
export function ToolBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex items-center justify-center size-9 cursor-pointer transition-colors',
        'text-fg-2 hover:text-fg-1 hover:bg-bg-2',
        'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
      )}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt = '',
  kind = 'image',
  onDownload,
  annotation,
  actions,
  navigation,
}: ImageLightboxProps) {
  const isVideo = kind === 'video';
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  /** Kích thước THẬT của tệp ảnh — mốc để tính cỡ hiển thị khi zoom. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [annotating, setAnnotating] = useState(false);
  // Đo theo content box (đã trừ padding) — xem `useElementSize`.
  const [viewportRef, viewport] = useElementSize<HTMLDivElement>();
  const layout = layoutImage(natural, viewport, scale, rotation);

  // Reset transform khi CHUYỂN sang open — setState ngay trong thân render
  // (không phải effect) để tránh 1 lượt render thừa (React de-dupe cùng pass).
  // Radix giữ Content mounted trong lúc animate-out nên state không tự mất —
  // vẫn cần reset thủ công mỗi lần mở lại.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRotation(0);
      setScale(1);
      setNatural(null);
      setAnnotating(false);
    }
  }

  // ⛔ Chuyển sang ảnh khác (nút ‹ ›) cũng phải reset y như mở mới. Thiếu nhịp này
  // thì ảnh sau kế thừa zoom/xoay của ảnh trước, và tệ hơn: `natural` còn giữ kích
  // thước ảnh CŨ nên khung được tính sai cho tới khi `onLoad` của ảnh mới chạy —
  // thấy rõ thành một cú giật khung khi ảnh hai tấm khác tỉ lệ.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setRotation(0);
    setScale(1);
    setNatural(null);
    setAnnotating(false);
  }

  // `AnnotationLayer` đo ảnh gốc từ bitmap (chế độ vẽ không render `<img>` để lấy onLoad).
  const handleNatural = useCallback((next: { w: number; h: number }) => setNatural(next), []);

  const handleAnnotationSave = useCallback(
    (result: AnnotationResult) => {
      setAnnotating(false);
      annotation?.onSave(result);
    },
    [annotation],
  );

  // Wheel zoom — chỉ ảnh; video đã có thanh control riêng (seek/volume), wheel
  // không nên bị chặn `preventDefault` vô nghĩa.
  useEffect(() => {
    if (!open || isVideo) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clamp(s + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), ZOOM_MIN, ZOOM_MAX));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [open, isVideo]);

  /**
   * ←/→ chuyển ảnh. Tắt khi ĐANG VẼ: lúc đó mũi tên thuộc về lớp chú thích (dời
   * hình đang chọn), cướp phím ở đây là nét vẽ dở bay mất theo ảnh.
   */
  useEffect(() => {
    if (!open || !navigation || annotating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') navigation.onPrev();
      else navigation.onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, navigation, annotating]);

  const rotateLeft = () => setRotation((r) => r - 90);
  const rotateRight = () => setRotation((r) => r + 90);
  const zoomIn = () => setScale((s) => clamp(s + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
  const zoomOut = () => setScale((s) => clamp(s - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX));
  const reset = () => {
    setRotation(0);
    setScale(1);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay — Figma spec: bg black/60 + blur 5px */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[5px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center outline-none"
          // Đang vẽ → Esc thuộc về lớp chú thích (bỏ hình dở / bỏ chọn / thoát chế độ vẽ),
          // không được đóng thẳng khung xem làm mất sạch nét chưa lưu. Radix nghe Esc ở
          // `document` nên chặn phải làm ở đây, listener trên `window` của lớp vẽ là quá muộn.
          onEscapeKeyDown={(e) => {
            if (annotating) e.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {alt || 'Image preview'}
          </DialogPrimitive.Title>

          {/*
            Chuyển ảnh — ghim giữa hai mép, là anh em của vùng xem chứ KHÔNG nằm
            trong nó, nên click không đi qua `onClick` đóng khung của vùng xem.
            `stopPropagation` giữ lại như hàng rào cho lần ai đó dời cụm nút này
            vào trong vùng xem — lúc đó thiếu nó là bấm ‹ › thành đóng khung.
            Ẩn khi đang vẽ: đổi ảnh giữa chừng làm mất sạch nét chưa lưu.
          */}
          {navigation && navigation.total > 1 && !annotating && (
            <>
              <button
                aria-label="Ảnh trước"
                className="absolute left-4 top-1/2 z-10 grid size-10 -translate-y-1/2 cursor-pointer place-items-center bg-bg-popup/80 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg-1"
                title="Ảnh trước (←)"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigation.onPrev();
                }}
              >
                <SystemIcon name="angle-left-outline" size={20} />
              </button>
              <button
                aria-label="Ảnh sau"
                className="absolute right-4 top-1/2 z-10 grid size-10 -translate-y-1/2 cursor-pointer place-items-center bg-bg-popup/80 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg-1"
                title="Ảnh sau (→)"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigation.onNext();
                }}
              >
                <SystemIcon name="angle-right-outline" size={20} />
              </button>

              {/* Đếm — cho biết còn bao nhiêu tấm nữa, và đang ở đâu trong xấp ảnh. */}
              <span className="absolute left-1/2 top-4 z-10 -translate-x-1/2 bg-bg-popup/80 px-2 py-0.5 text-caption-12 tabular-nums text-fg-on-popup select-none">
                {navigation.index + 1} / {navigation.total}
              </span>
            </>
          )}

          {/* Tải + Đóng — top right, cùng hàng */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            {onDownload ? (
              <button
                aria-label="Tải về"
                className="flex items-center justify-center size-9 cursor-pointer text-fg-2 hover:text-fg-1 hover:bg-bg-2 transition-colors"
                title="Tải về"
                type="button"
                onClick={onDownload}
              >
                <SystemIcon name="arrow-down-to-bracket-outline" size={18} />
              </button>
            ) : null}
            <DialogPrimitive.Close className="flex items-center justify-center size-9 cursor-pointer text-fg-2 hover:text-fg-1 hover:bg-bg-2 transition-colors">
              <SystemIcon name="xmark-outline" size={18} />
            </DialogPrimitive.Close>
          </div>

          {isVideo ? (
            // Video — control gốc của trình duyệt (play/seek/volume/fullscreen)
            // đã đủ, không cần overlay xoay/zoom; click nền KHÔNG đóng (dễ bấm
            // nhầm khi rê chuột qua thanh seek sát viền).
            <div className="flex-1 w-full flex items-center justify-center p-8">
              <video autoPlay className="max-h-full max-w-full outline-none" controls src={src} />
            </div>
          ) : (
            <>
              {/*
                Vùng xem CÓ THỂ CUỘN: zoom quá khung thì kéo xem phần còn lại,
                thay vì tràn ra ngoài không tới được (bản cũ).
                `m-auto` trên hộp ảnh — KHÔNG `justify-center`: căn giữa bằng
                justify sẽ cắt mất mép trên/trái khi ảnh lớn hơn khung.
                Click nền để đóng.
              */}
              <div
                ref={viewportRef}
                className={cn(
                  'flex min-h-0 w-full flex-1 overflow-auto p-6',
                  // Đang vẽ → click nền KHÔNG đóng, bấm hụt là mất sạch nét đang dở.
                  annotating ? 'cursor-default' : 'cursor-zoom-out',
                )}
                onClick={() => !annotating && onOpenChange(false)}
              >
                <div
                  className="relative m-auto shrink-0"
                  style={
                    layout
                      ? { width: layout.boxWidth, height: layout.boxHeight }
                      : { width: '100%', height: '100%' }
                  }
                >
                  {annotating && annotation?.source ? (
                    <Suspense
                      fallback={
                        <div className="absolute inset-0 grid place-items-center">
                          <Spinner size="lg" />
                        </div>
                      }
                    >
                      <AnnotationLayer
                        // `key` theo ảnh — mỗi ảnh phải bắt đầu với state nét vẽ tươi.
                        key={src}
                        fileName={annotation.fileName}
                        initialShapes={annotation.initialShapes ?? EMPTY_SHAPES}
                        layout={layout}
                        rotation={rotation}
                        saving={annotation.saving ?? false}
                        source={annotation.source}
                        onCancel={() => setAnnotating(false)}
                        onNatural={handleNatural}
                        onSave={handleAnnotationSave}
                      />
                    </Suspense>
                  ) : (
                    <img
                      alt={alt}
                      className={cn(
                        'absolute left-1/2 top-1/2 cursor-default select-none',
                        'transition-[width,height] duration-150 ease-out',
                        // Chưa biết kích thước thật (chưa `onLoad`) → chặn tạm
                        // trong khung để không loé một khung hình ảnh cỡ gốc.
                        layout ? 'max-w-none' : 'max-h-full max-w-full',
                      )}
                      draggable={false}
                      src={src}
                      style={{
                        // `translate` đưa tâm ảnh về tâm hộp; `rotate` xoay quanh
                        // chính tâm đó. KHÔNG có `scale` — zoom nằm ở width/height.
                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                        ...(layout ? { width: layout.width, height: layout.height } : {}),
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onLoad={(e) =>
                        setNatural({
                          w: e.currentTarget.naturalWidth,
                          h: e.currentTarget.naturalHeight,
                        })
                      }
                    />
                  )}
                </div>
              </div>

              {/* Toolbar — bottom center */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 bg-bg-popup border border-border-2 backdrop-blur-sm shadow-[0_4px_16px_var(--color-popup-shadow)]">
                <ToolBtn
                  icon={<SystemIcon name="arrow-rotate-left-outline" size={16} />}
                  label="Xoay trái"
                  onClick={rotateLeft}
                />
                <ToolBtn
                  disabled={scale <= ZOOM_MIN}
                  icon={<SystemIcon name="zoom-out-bold" size={16} />}
                  label="Thu nhỏ"
                  onClick={zoomOut}
                />
                <ToolBtn
                  icon={<SystemIcon name="maximize-outline" size={16} />}
                  label="Đặt lại"
                  onClick={reset}
                />
                <ToolBtn
                  disabled={scale >= ZOOM_MAX}
                  icon={<SystemIcon name="zoom-in-bold" size={16} />}
                  label="Phóng to"
                  onClick={zoomIn}
                />
                <ToolBtn
                  icon={<SystemIcon name="arrow-rotate-right-outline" size={16} />}
                  label="Xoay phải"
                  onClick={rotateRight}
                />

                {/* Chú thích — chỉ hiện khi caller bật, và ẩn lúc đang vẽ (thoát bằng nút Hủy). */}
                {annotation && !annotating && (
                  <>
                    <span className="mx-1 h-6 w-px bg-border-2" />
                    <ToolBtn
                      disabled={!annotation.source}
                      icon={<SystemIcon name="pen-outline" size={16} />}
                      label="Chú thích ảnh"
                      onClick={() => setAnnotating(true)}
                    />
                  </>
                )}

                {actions && !annotating && (
                  <>
                    <span className="mx-1 h-6 w-px bg-border-2" />
                    {actions}
                  </>
                )}

                {/* Mức phóng THẬT so với ảnh gốc (không phải so với cỡ vừa
                    khung) — 100% = đúng 1 pixel ảnh trên 1 pixel màn hình. */}
                <span className="ml-1 min-w-[3rem] text-center text-caption-12 text-fg-on-popup select-none">
                  {layout && natural
                    ? Math.round((layout.width / natural.w) * 100)
                    : Math.round(scale * 100)}
                  %
                </span>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default ImageLightbox;
