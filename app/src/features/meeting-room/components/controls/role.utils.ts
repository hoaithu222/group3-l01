import type { RoomRole } from '../../api/meeting-room.types';

/**
 * Chủ trì hoặc đồng chủ trì (vai trò TRONG PHIÊN) — nhóm được thấy mục điều khiển của chủ trì. Đây chỉ là việc ẨN/HIỆN giao diện; quyền thật
 * do server quyết (mọi thao tác chủ trì đều bị kiểm lại ở BE), nên client không tự suy quyền từ chỗ khác.
 */
export const isHostLikeRole = (role: RoomRole | null | undefined): boolean => role === 'HOST' || role === 'CO_HOST';
