import { issueMediaToken, roomNames, type MediaTokenResult } from "../../infrastructure/media";
import type { SpikeTokenDto } from "./media-dev.validators";

/**
 * Cấp token cho phòng spike P0 (`spike_<tên>`). Danh tính lấy từ PHIÊN (`req.user`), không từ body; grant chỉ cho
 * room này. Nghiệp vụ gọi/họp thật (p2-*) dùng `issueMediaToken` sau `PermissionService` — không qua đây.
 */
export class MediaDevService {
  issueSpikeToken(user: { id: string; email: string; name?: string }, dto: SpikeTokenDto): Promise<MediaTokenResult> {
    return issueMediaToken({
      userId: user.id,
      displayName: user.name || user.email,
      room: roomNames.spike(dto.room),
      publish: { ...dto.publish, data: true },
      metadata: { role: "spike" },
    });
  }
}
