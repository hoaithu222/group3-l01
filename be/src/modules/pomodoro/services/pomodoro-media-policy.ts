import type { MediaPermission, MediaTrackSource } from "../../../infrastructure/media";
import type { PomodoroConfig, PomodoroPhaseValue, PomodoroPublish, PomodoroRulesDto } from "../entities/pomodoro.interface";
import { isFocusLike } from "./pomodoro-state-machine";

/**
 * Luật mic theo phase (p5-02 README §2 "Luật mic") — THUẦN, thực thi ở MÁY CHỦ MEDIA (không tin client): FOCUS (kể cả PAUSED giữa vòng) khoá
 * MICROPHONE và âm thanh chia sẻ màn hình, vẫn cho CAMERA + SCREEN_SHARE; BREAK/WAITING trả lại MICROPHONE nhưng KHÔNG bật mic hộ.
 * Chủ phòng chỉ được miễn khi `config.hostCanSpeakInFocus` (P1, mặc định không).
 */

/** Chủ phòng có được nói trong FOCUS không. */
export function isHostExempt(config: Pick<PomodoroConfig, "hostCanSpeakInFocus">, isHost: boolean): boolean {
  return isHost && config.hostCanSpeakInFocus;
}

/** Phiên đang ở trạng thái khoá mic (theo phase hiện tại). */
export function isMicLockedPhase(phase: PomodoroPhaseValue, previousPhase: PomodoroPhaseValue | null): boolean {
  return isFocusLike(phase, previousPhase);
}

/** Quyền publish LƯU ở `CallParticipant.publishPermissions` — token cấp lại (`POST /calls/:id/token`) đọc đúng giá trị này. */
export function publishFor(locked: boolean, hostExempt: boolean): PomodoroPublish {
  return { audio: !locked || hostExempt, video: true, screen: true };
}

/**
 * Quyền LiveKit (`updateParticipant` THAY THẾ nguyên khối) từ nguồn cơ sở của lõi `calls` (`CallRoomPermissions.sources`: đã tính
 * `mutedByHost`) rồi lọc theo phase. ⛔ `canPublish` PHẢI `false` khi danh sách nguồn RỖNG — LiveKit coi rỗng + `canPublish: true` là MỌI nguồn.
 */
export function permissionFor(baseSources: readonly MediaTrackSource[], locked: boolean, hostExempt: boolean): MediaPermission {
  const sources = locked && !hostExempt ? baseSources.filter((s) => s !== "MICROPHONE" && s !== "SCREEN_SHARE_AUDIO") : [...baseSources];
  return { canPublish: sources.length > 0, canSubscribe: true, canPublishData: true, canPublishSources: sources, canUpdateMetadata: true };
}

/** Luật hiển thị cho client (snapshot `rules`). */
export function rulesFor(phase: PomodoroPhaseValue, previousPhase: PomodoroPhaseValue | null): PomodoroRulesDto {
  return { micAllowed: !isMicLockedPhase(phase, previousPhase), cameraAllowed: true, screenShareAllowed: true };
}
