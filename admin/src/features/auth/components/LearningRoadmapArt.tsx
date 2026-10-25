/**
 * LearningRoadmapArt — hình minh hoạ "lộ trình học" của khoang giới thiệu.
 *
 *                      ╭ ‐ ‐ ◌ ‐ ‐ ‐ ★     ← nửa SẮP TỚI (nét đứt, nhạt): kỹ năng xác thực → huy hiệu
 *                      ┆
 *                     (📍)                 ← ĐANG HỌC — điểm nối hai nửa, có quầng thở chậm
 *                      │
 *   ●────────●─────────╯                   ← nửa ĐÃ ĐI (nét liền màu thương hiệu): bài học → luyện tập
 *
 * MỘT đường cong chữ S — đúng dáng "đường cong học tập": chậm lúc đầu, tăng tốc ở giữa, chững lại ở đích
 * — và năm cột mốc. Hình KHÔNG có chữ: nghĩa từng việc đã nằm ở danh sách phân hệ ngay bên dưới, hình chỉ
 * cần nói một điều — "đây là nơi người ta học theo lộ trình".
 *
 * ── Vì sao dựng bằng HAI GÓC BO, không phải SVG ────────────────────────────
 * kit2 cấm `<svg>` nội tuyến. Một hộp chỉ có viền dưới + viền phải, bo góc dưới-phải `100%` (bán kính =
 * CẢ bề ngang lẫn bề cao của hộp) vẽ ra đúng MỘT phần tư elip nối góc dưới-trái → góc trên-phải, không
 * còn đoạn thẳng nào. Hộp thứ hai (viền trên + trái, bo góc trên-trái) đặt chéo ở nửa trên-phải cho cung
 * còn lại. Hai cung gặp nhau ở tâm khung với cùng tiếp tuyến THẲNG ĐỨNG ⇒ chữ S liền, không gãy khúc.
 *
 * ⚠️ Toạ độ nút (`ROADMAP_NODES`) là điểm THẬT trên hai cung, tính bằng % của CHÍNH khung đường cong ⇒
 *    khung bị kéo cao/hẹp thế nào nút vẫn nằm đúng trên đường. Đổi hình học khung là phải tính lại.
 *
 * ── Chiều cao ───────────────────────────────────────────────────────────────
 * `flex-1` để HÚT phần cao dôi của khoang (khoang bị `stretch` cao bằng khoang form), kẹp trong
 * 132 → 232px. Dưới 132px năm nút chồng lên nhau. Phần cứng của khoang là 386px (tính ở `AUTH_CARD_HEIGHT`),
 * nên hình chỉ còn đủ 132px khi tấm thẻ cao ≥ 600px (386 + 132 + lề trong 80 + viền 2), tức khung nhìn
 * ≥ 712px. Ngưỡng ẩn đặt ở 736px (`46rem`, chừa 24px phòng chênh lệch phông): thấp hơn thì ẩn hẳn hình
 * thay vì để nó đè lên danh sách phân hệ. Màn hẹp (< `lg`, hai khoang xếp dọc) cũng ẩn: ở đó không có
 * chiều cao dôi nào để hút, hình chỉ đẩy form xuống xa hơn.
 *
 * ⛔ Trang trí thuần: `aria-hidden`, `pointer-events-none`. Chỉ MỘT thứ chuyển động — quầng "đang học"
 *    thở chậm (`animate-auth-pulse`, chỉ `opacity` + `scale`) — và nó TẮT khi người dùng chọn giảm chuyển
 *    động; lúc đó quầng đứng yên ở `opacity-70`.
 */

import { Fragment, memo } from 'react';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import {
  ROADMAP_HALO_STYLE,
  ROADMAP_NODE_LOOK,
  ROADMAP_NODES,
  ROADMAP_TRACK_DONE_STYLE,
  ROADMAP_TRACK_NEXT_STYLE,
} from '../constants/auth-decor';

const LearningRoadmapArt = memo(function LearningRoadmapArt() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative hidden max-h-[232px] min-h-[132px] flex-1 lg:[@media(min-height:46rem)]:block"
    >
      {/* Khung đường cong. Lề 24px bốn phía ≥ nửa nút lớn nhất nằm ở GÓC (nút đích 40px ⇒ 20px) + viền
          tem 3px: nút đầu (0% · 100%) và nút đích (100% · 0%) nằm ĐÚNG góc khung, thiếu lề là bị cắt mất
          một nửa. */}
      <div className="absolute inset-6">
        <span
          className="absolute bottom-0 left-0 h-1/2 w-1/2 rounded-br-[100%] border-b-2 border-r-2"
          style={ROADMAP_TRACK_DONE_STYLE}
        />
        <span
          className="absolute right-0 top-0 h-1/2 w-1/2 rounded-tl-[100%] border-l-2 border-t-2 border-dashed"
          style={ROADMAP_TRACK_NEXT_STYLE}
        />

        {ROADMAP_NODES.map((n) => {
          const look = ROADMAP_NODE_LOOK[n.state];
          const at = { left: `${n.x}%`, top: `${n.y}%` };
          return (
            <Fragment key={n.key}>
              {/* Quầng là phần tử ANH EM đứng TRƯỚC nút (không phải con của nút): nút có `transform`
                  nên tạo stacking context riêng — quầng làm con thì dù `-z` vẫn vẽ ĐÈ lên nền nút. */}
              {n.state === 'current' && (
                <span
                  className="absolute size-20 -translate-x-1/2 -translate-y-1/2 animate-auth-pulse rounded-full opacity-70 motion-reduce:animate-none"
                  style={{ ...at, ...ROADMAP_HALO_STYLE }}
                />
              )}
              <span
                className={cn(
                  'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
                  look.node,
                )}
                style={{ ...at, ...look.style }}
              >
                <SystemIcon className={look.icon} name={n.icon} size={look.iconSize} />
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
});

export default LearningRoadmapArt;
