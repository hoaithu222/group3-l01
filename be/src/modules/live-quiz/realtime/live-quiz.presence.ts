import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { getIO, type SocketData } from "../../../infrastructure/socket/socket.server";

/** Cổng hỏi "host có socket nào đang ở room `quiz:{id}` không" — dùng khi QUYẾT ĐỊNH kết thúc vì host mất kết nối (`quiz.host-timeout`). */
export interface IQuizHostPresence {
  hostConnected(sessionId: string, hostId: string): Promise<boolean>;
}

/** Bản thật: `fetchSockets()` qua Redis adapter (đa instance) — chỉ chạy ở tiến trình có Socket.IO (API/`all`); worker thuần ném lỗi. */
export class SocketQuizHostPresence implements IQuizHostPresence {
  async hostConnected(sessionId: string, hostId: string): Promise<boolean> {
    const sockets = await getIO().in(ROOM.quiz(sessionId)).fetchSockets();
    return sockets.some((s) => (s.data as Partial<SocketData>).user?.id === hostId);
  }
}
