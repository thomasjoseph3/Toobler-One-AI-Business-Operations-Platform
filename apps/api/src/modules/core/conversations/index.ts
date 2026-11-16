// The public face of the conversations module: the only file other modules may import from it.
// The channels use these to write down a conversation and its messages, and to ask for it to be sorted when it ends.
export { createConversationRecordsService } from './services/conversation-records.service';
export type { AddMessageInput, StartConversationInput } from './services/conversation-records.service';
export { createConversationFinaliser } from './services/conversation-finaliser.service';
export type { FinaliseOptions, FinaliseResult } from './services/conversation-finaliser.service';
export { createConversationClassifier } from './services/conversation-classifier.service';
// "Test the agent" (F19) saves its chats as conversations, so it follows the same rule about who may read them.
export { refuseOwnLeadsOnlyRole } from './services/conversation-reader.service';
