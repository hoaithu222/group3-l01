/**
 * AuthBackdrop — nền "trang vở" của mọi màn xác thực.
 *
 * Bốn lớp, từ dưới lên, gom trong MỘT tầng `fixed` (đứng yên khi trang cuộn trên màn hẹp):
 *
 *   1. QUẦNG MÀU — bốn đốm tím · hồng · teal · hổ phách ở bốn góc (`BACKDROP_GLOW_STYLE`)
 *   2. GIẤY CHẤM — lưới chấm của sổ tay, tan dần ra bốn mép (`BACKDROP_DOTS_STYLE`)
 *   3. NÉT VẼ LỀ — bốn icon nét mảnh, nghiêng, rất mờ ở hai dải lề (chỉ từ `xl`)
 *   4. SAO XP    — năm ngôi sao nhỏ nhấp nháy chậm trong các dải lề quanh tấm thẻ
 *
 * ⛔ THƯA và CHẬM có chủ ý: màn này chỉ có một việc (gõ email + mật khẩu). Chỉ ngôi sao chuyển động, chỉ
 *    bằng `opacity`, và TẮT hẳn khi người dùng chọn giảm chuyển động — lúc đó sao đứng yên ở `opacity-50`
 *    (giữa biên độ nhấp nháy), không sáng bừng lên.
 * ⛔ Trang trí thuần: cả tầng `aria-hidden` + `pointer-events-none`.
 * ⛔ KHÔNG hex. Màu đi qua token + `hudMix()` (ở `constants/auth-decor.ts`), icon tô bằng class `text-*` —
 *    HAI bậc sáng/tối (`DECOR_TONE`), vì thang màu tông không tự lật theo theme.
 */

import { memo } from 'react';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import {
  BACKDROP_DOODLES,
  BACKDROP_DOTS_STYLE,
  BACKDROP_GLOW_STYLE,
  BACKDROP_SPARKLES,
} from '../constants/auth-decor';

const AuthBackdrop = memo(function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <span className="absolute inset-0" style={BACKDROP_GLOW_STYLE} />
      <span className="absolute inset-0" style={BACKDROP_DOTS_STYLE} />

      {/* Độ mờ đặt cho CẢ LỚP (không từng icon): bốn nét vẽ phải mờ như nhau, lệch nhau là mắt đọc ra một
          cái "quan trọng hơn" và đi tìm nghĩa của nó. */}
      <div className="absolute inset-0 hidden opacity-35 xl:block">
        {BACKDROP_DOODLES.map((d) => (
          <SystemIcon
            key={d.key}
            className={cn('absolute', d.tone)}
            name={d.icon}
            size={d.size}
            style={{ left: d.left, rotate: `${d.rotate}deg`, top: d.top }}
          />
        ))}
      </div>

      {BACKDROP_SPARKLES.map((s) => (
        <SystemIcon
          key={s.key}
          className={cn(
            'absolute animate-auth-twinkle opacity-50 motion-reduce:animate-none',
            s.tone,
          )}
          name="star-bold"
          size={s.size}
          style={{ animationDelay: s.delay, left: s.left, top: s.top }}
        />
      ))}
    </div>
  );
});

export default AuthBackdrop;
