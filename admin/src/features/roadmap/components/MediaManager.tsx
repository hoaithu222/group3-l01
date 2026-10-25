import { useCallback, useMemo, useRef, useState } from 'react';

import { Badge, BoxGrid, Button, ImagePreview, Input, Popover, Textarea, Upload } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { showToast } from '@/shared/utils/toast.utils';
import { cn } from '@/shared/utils/style/cn';

import { useRoadmapImageUpload } from '../hooks/useRoadmapImageUpload';
import {
  useAddMedia,
  useDeleteMedia,
  usePatchMedia,
  useRoadmapAssetUrl,
} from '../service/roadmap.queries';
import { computeOrderBetween } from '../service/roadmap.service';
import type { RoadmapMediaDto } from '../types/roadmap.types';

const MEDIA_GROUP_SUGGESTIONS = ['Tại lớp', 'Bài về nhà', 'Minh hoạ'] as const;
/** be.md §9 `LIMITS.roadmap.svgMaxBytes`. */
const SVG_MAX_BYTES = 200_000;

function AssetThumb({ assetId, alt }: { assetId: string; alt: string }) {
  const { data: url } = useRoadmapAssetUrl(assetId);
  return (
    <ImagePreview
      alt={alt}
      className="size-full"
      fallback={<SystemIcon className="text-fg-4" name="image-outline" size={32} />}
      preview
      rounded="md"
      size="lg"
      src={url}
    />
  );
}

interface MediaCardProps {
  item: RoadmapMediaDto;
  draggable: boolean;
  isDragging: boolean;
  onInsert?: (markdown: string) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

function MediaCard({ item, draggable, isDragging, onInsert, onDragStart, onDragOver, onDrop }: MediaCardProps) {
  const patch = usePatchMedia();
  const del = useDeleteMedia();
  const [editOpen, setEditOpen] = useState(false);
  const [group, setGroup] = useState(item.group ?? '');
  const [caption, setCaption] = useState(item.caption ?? '');

  const save = useCallback(async () => {
    await patch.mutateAsync({ id: item.id, group: group || null, caption: caption || null });
    setEditOpen(false);
  }, [caption, group, item.id, patch]);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border-2 bg-bg-2 p-2 transition-opacity',
        isDragging && 'opacity-40',
      )}
      draggable={draggable}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragStart={onDragStart}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-bg-3">
        {item.kind === 'SVG' && item.svg ? (
          // SVG đã vệ sinh ở BE (`svg-sanitize.ts`, be.md §2) trước khi lưu — an toàn để render trực tiếp.
          <div
            className="flex size-full items-center justify-center p-2 [&>svg]:size-full [&>svg]:object-contain"
            dangerouslySetInnerHTML={{ __html: item.svg }}
          />
        ) : item.assetId ? (
          <AssetThumb alt={item.caption ?? 'Ảnh buổi học'} assetId={item.assetId} />
        ) : (
          <SystemIcon className="text-fg-4" name="image-outline" size={32} />
        )}
      </div>

      <div className="flex flex-col gap-0.5">
        <Badge color="neutral" variant="tinted">
          {item.group ?? 'Chưa phân nhóm'}
        </Badge>
        {item.caption && <span className="truncate text-caption-12 text-fg-4">{item.caption}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="cursor-grab text-fg-4" title="Kéo để sắp xếp">
          <SystemIcon name="grip-dots-vertical-outline" size={14} />
        </span>
        {onInsert && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onInsert(`![${item.caption ?? ''}](media:${item.id})`)}
          >
            Chèn vào nội dung
          </Button>
        )}
        <Popover
          align="start"
          content={
            <div className="flex w-64 flex-col gap-2 p-3">
              <Input
                placeholder="Nhóm (Tại lớp / Bài về nhà / Minh hoạ…)"
                size="sm"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
              <Input
                placeholder="Chú thích"
                size="sm"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
              <Button loading={patch.isPending} size="sm" variant="primary" onClick={() => void save()}>
                Lưu
              </Button>
            </div>
          }
          open={editOpen}
          side="bottom"
          variant="glass"
          onOpenChange={setEditOpen}
        >
          <Button size="sm" variant="ghost">
            Sửa
          </Button>
        </Popover>
        <Button
          loading={del.isPending}
          size="sm"
          variant="ghost"
          onClick={() => void del.mutateAsync(item.id)}
        >
          Xoá
        </Button>
      </div>
    </div>
  );
}

export interface MediaManagerProps {
  lessonId: string;
  media: RoadmapMediaDto[];
  /** Chèn `![chú thích](media:<id>)` vào ô nội dung (tab "Nội dung") — bỏ trống thì ẩn nút "Chèn vào nội dung". */
  onInsert?: (markdown: string) => void;
}

/**
 * Tab "Hình ảnh" của `LessonEditorPage` (admin.md §2) — lưới ảnh, quản lý RIÊNG khỏi form gộp của lesson
 * (media có endpoint/CAS của chính nó, be.md §4: `POST .../media`, `PATCH·DELETE /admin/roadmap/media/:id`
 * — mỗi thao tác lưu/xoá NGAY, không đợi nút "Lưu" của trang). Hai đường nạp ảnh: tải PNG/JPG/WebP (asset
 * scope `ROADMAP`, `useRoadmapImageUpload`) hoặc dán/tải SVG thô — BE vệ sinh SVG (`svg-sanitize.ts`), FE
 * chỉ giới hạn thô theo `LIMITS.roadmap.svgMaxBytes` để tránh gửi thừa. Kéo-thả đổi thứ tự bằng HTML5
 * drag-and-drop gốc (không thêm gói) — thả xong PATCH `order` (float, `computeOrderBetween`) của đúng
 * ảnh vừa kéo.
 */
export default function MediaManager({ lessonId, media, onInsert }: MediaManagerProps) {
  const upload = useRoadmapImageUpload();
  const addMedia = useAddMedia();
  const patchMedia = usePatchMedia();
  const svgInputRef = useRef<HTMLInputElement>(null);
  const [svgPanelOpen, setSvgPanelOpen] = useState(false);
  const [svgText, setSvgText] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const sorted = useMemo(() => [...media].sort((a, b) => a.order - b.order), [media]);

  const handleImageFiles = useCallback(
    async (files: File[]) => {
      const controller = new AbortController();
      for (const file of files) {
        try {
          const assetId = await upload.onUpload(file, { onProgress: () => {}, signal: controller.signal });
          await addMedia.mutateAsync({ lessonId, kind: 'ASSET', assetId });
        } catch {
          // Lỗi tải/thêm đã toast (interceptor + mutation) — bỏ qua để tiếp tục các tệp còn lại.
        }
      }
    },
    [addMedia, lessonId, upload],
  );

  const handleSvgFile = useCallback((file: File) => {
    if (file.size > SVG_MAX_BYTES) {
      showToast('error', `SVG vượt giới hạn ${Math.round(SVG_MAX_BYTES / 1024)} KB`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setSvgText(String(reader.result ?? ''));
    reader.readAsText(file);
  }, []);

  const submitSvg = useCallback(async () => {
    const trimmed = svgText.trim();
    if (!trimmed) return;
    if (new Blob([trimmed]).size > SVG_MAX_BYTES) {
      showToast('error', `SVG vượt giới hạn ${Math.round(SVG_MAX_BYTES / 1024)} KB`);
      return;
    }
    await addMedia.mutateAsync({ lessonId, kind: 'SVG', svg: trimmed });
    setSvgText('');
    setSvgPanelOpen(false);
  }, [addMedia, lessonId, svgText]);

  const handleDrop = useCallback(
    (targetId: string) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        return;
      }
      const fromIndex = sorted.findIndex((m) => m.id === dragId);
      const toIndex = sorted.findIndex((m) => m.id === targetId);
      if (fromIndex === -1 || toIndex === -1) {
        setDragId(null);
        return;
      }
      const prev = sorted[toIndex - (fromIndex < toIndex ? 0 : 1)];
      const next = sorted[toIndex + (fromIndex < toIndex ? 1 : 0)];
      const order = computeOrderBetween(prev?.id === dragId ? undefined : prev?.order, next?.id === dragId ? undefined : next?.order);
      void patchMedia.mutateAsync({ id: dragId, order });
      setDragId(null);
    },
    [dragId, patchMedia, sorted],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Upload
          accept="image/jpeg,image/png,image/webp"
          maxSize={5 * 1024 * 1024}
          multiple
          variant="inline"
          onFiles={(files) => void handleImageFiles(files)}
        />
        <Button
          size="sm"
          startIcon={<SystemIcon name="file-code-outline" size={14} />}
          variant="stroke"
          onClick={() => setSvgPanelOpen((v) => !v)}
        >
          Dán / tải SVG
        </Button>
        <input
          ref={svgInputRef}
          accept=".svg,image/svg+xml"
          className="hidden"
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleSvgFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {svgPanelOpen && (
        <div className="flex flex-col gap-2 rounded-md border border-border-2 bg-bg-2 p-3">
          <div className="flex items-center justify-between">
            <span className="text-body-14-medium text-fg-1">Dán mã SVG hoặc chọn tệp .svg</span>
            <Button size="sm" variant="ghost" onClick={() => svgInputRef.current?.click()}>
              Chọn tệp .svg
            </Button>
          </div>
          <Textarea
            maxLength={SVG_MAX_BYTES}
            minHeight={120}
            placeholder="<svg …>…</svg>"
            value={svgText}
            onChange={(e) => setSvgText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={!svgText.trim()}
              loading={addMedia.isPending}
              size="sm"
              variant="primary"
              onClick={() => void submitSvg()}
            >
              Thêm ảnh SVG
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSvgPanelOpen(false)}>
              Huỷ
            </Button>
          </div>
          <p className="text-caption-12 text-fg-4">
            Gợi ý nhóm: {MEDIA_GROUP_SUGGESTIONS.join(' · ')}. BE tự vệ sinh (bỏ script/on*/tham chiếu ngoài).
          </p>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-body-14 text-fg-4">Chưa có ảnh nào cho buổi này.</p>
      ) : (
        <BoxGrid gap="sm" min="sm">
          {sorted.map((item) => (
            <MediaCard
              key={item.id}
              draggable
              isDragging={dragId === item.id}
              item={item}
              onDragOver={() => {}}
              onDragStart={() => setDragId(item.id)}
              onDrop={() => handleDrop(item.id)}
              onInsert={onInsert}
            />
          ))}
        </BoxGrid>
      )}
    </div>
  );
}
