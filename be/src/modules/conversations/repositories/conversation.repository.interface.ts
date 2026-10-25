import type { Conversation } from "../entities/conversation.interface";

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByDirectKey(directKey: string): Promise<Conversation | null>;
  findByMeetingKey(meetingKey: string): Promise<Conversation | null>;
}
