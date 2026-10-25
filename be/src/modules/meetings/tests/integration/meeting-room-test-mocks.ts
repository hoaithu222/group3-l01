/**
 * PHẢI được import ĐẦU TIÊN trong mỗi test tích hợp của PHÒNG HỌP (p2-05): đặt env LiveKit giả (token ký thật, không mạng) TRƯỚC khi `core/config`
 * được nạp (env đọc lúc import), rồi dùng lại các mock hạ tầng của `meetings` (cờ `meeting`, Redis có state, bỏ outbox signal).
 */
process.env.LIVEKIT_URL = "http://localhost:7880";
process.env.LIVEKIT_PUBLIC_URL = "ws://localhost:7880";
process.env.LIVEKIT_API_KEY = "devkey";
process.env.LIVEKIT_API_SECRET = "devsecretdevsecretdevsecretdevsecret1234";

import { installMocks, redisStore } from "./meetings-test-mocks";

export { installMocks, redisStore };
