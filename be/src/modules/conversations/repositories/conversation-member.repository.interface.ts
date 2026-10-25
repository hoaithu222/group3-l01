import type { ConversationMember } from "../entities/conversation.interface";

export interface IConversationMemberRepository {
  findByConversationAndUser(conversationId: string, userId: string): Promise<ConversationMember | null>;
  listActiveByConversation(conversationId: string): Promise<ConversationMember[]>;
}
