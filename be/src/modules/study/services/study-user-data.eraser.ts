import type { IMockAnswerRepository } from "../repositories/mock-answer.repository.interface";
import type { IMockAttemptRepository } from "../repositories/mock-attempt.repository.interface";
import type { ISrEnrollmentRepository } from "../repositories/sr-enrollment.repository.interface";
import type { ISrProgressRepository } from "../repositories/sr-progress.repository.interface";
import type { ISrReviewLogRepository } from "../repositories/sr-review-log.repository.interface";

export interface StudyErasedCounts {
  attempts: number;
  answers: number;
  progress: number;
  enrollments: number;
  reviewLogs: number;
}

/**
 * Ẩn danh hoá tài khoản (D-02, p4-02 be.md §7): xoá dữ liệu HỌC CÁ NHÂN — lượt thi + đáp án, tiến độ/đăng ký/nhật ký ôn. Bộ học do
 * người đó tạo giữ nguyên (nội dung chia sẻ; tên tác giả hiển thị "Tài khoản đã xoá"). Idempotent (`deleteMany`).
 */
export class StudyUserDataEraser {
  constructor(
    private readonly r: {
      attempts: IMockAttemptRepository;
      answers: IMockAnswerRepository;
      progress: ISrProgressRepository;
      enrollments: ISrEnrollmentRepository;
      logs: ISrReviewLogRepository;
    }
  ) {}

  async erase(userId: string): Promise<StudyErasedCounts> {
    return {
      answers: await this.r.answers.deleteByUser(userId),
      attempts: await this.r.attempts.deleteByUser(userId),
      progress: await this.r.progress.deleteByUser(userId),
      enrollments: await this.r.enrollments.deleteByUser(userId),
      reviewLogs: await this.r.logs.deleteByUser(userId),
    };
  }
}
