import type { KnowledgeQuestion, PutAnswerRequest, SetupChatQuestion, SetupChatRequest, SetupChatResponse } from '@toobler-one/shared';
import { ApiError, notFound } from '../../../../kernel/errors';
import type { Principal } from '../../../../kernel/http/guard';
import type { createAiService } from '../../ai';
import type { createKnowledgeService } from '../../knowledge';
import { buildSetupReplyInstructions, buildSetupReplyMessage, SETUP_REPLY_PROMPT_VERSION } from '../helpers/build-setup-reply-prompt';
import { readAiReply, readReplyWithoutAi, setupReplyOutputSchema, type ReadReply } from '../helpers/read-setup-reply';
import { chooseNextChatQuestion, countFormOnlyQuestions, isChatQuestion } from '../helpers/setup-chat-questions';

/** The part of the AI service this needs: only the call that returns an answer in a fixed shape. */
export type SetupChatAiService = Pick<ReturnType<typeof createAiService>, 'generateObject'>;

/** What the owner is told when a reply could not be read, in plain words. */
const COULD_NOT_READ_REPLY = "I couldn't tell which answer you meant. Please pick one of the options, or say it another way.";
const AI_NOT_AVAILABLE_REPLY =
  "I can't read free-form replies right now. Please pick one of the options exactly, or use the form.";

/** The question as the chat sends it: the words and what the screen needs to offer ready answers. */
function toChatQuestion(question: KnowledgeQuestion): SetupChatQuestion {
  return {
    key: question.key,
    text: question.text,
    type: question.type,
    options: question.options ?? [],
    allowOther: question.allowOther,
    maxChoices: question.maxChoices,
    yesDetailLabel: question.yesDetail?.label ?? null,
    neededToGoLive: question.neededToGoLive,
  };
}

/**
 * The setup chat (F31): the owner answers the business questions one at a time. CODE picks every question (the profile's own order,
 * skipping what is answered or skipped) and CODE saves every answer through the same checks as the form (`answerQuestion`). The
 * AI is used only to read a pick or yes/no reply that plain matching cannot read, and what it says is checked again before saving.
 * The chat has no other tools and takes no instructions from the owner's words. It is stateless: the screen sends back what was
 * skipped.
 */
export function createSetupChatService(dependencies: {
  knowledgeService: ReturnType<typeof createKnowledgeService>;
  aiService: SetupChatAiService;
}) {
  const { knowledgeService, aiService } = dependencies;

  /** Reads the reply to one question: by code if it can, else by the AI. Null when neither can tell; a message when the AI is not available. */
  async function readReply(
    principal: Pick<Principal, 'accountId'>,
    question: KnowledgeQuestion,
    replyText: string,
  ): Promise<{ value: ReadReply } | { problem: string }> {
    const plain = readReplyWithoutAi(question, replyText);
    if (plain !== null) return { value: plain };
    // Text answers are always read by code, so a null here means a pick or yes/no reply that needs reading
    if (question.type === 'short_text' || question.type === 'long_text' || question.type === 'link') {
      return { problem: COULD_NOT_READ_REPLY };
    }
    try {
      const result = await aiService.generateObject(
        {
          accountId: principal.accountId,
          tag: { task: 'setup_chat', agentId: 'setup', channel: 'internal', promptVersion: SETUP_REPLY_PROMPT_VERSION },
          prompt: {
            stableSystemText: buildSetupReplyInstructions(),
            messages: [{ role: 'user', text: buildSetupReplyMessage(question, replyText) }],
          },
          temperature: 0,
          maxOutputTokens: 300,
        },
        setupReplyOutputSchema,
      );
      const value = readAiReply(question, result.value);
      return value === null ? { problem: COULD_NOT_READ_REPLY } : { value };
    } catch (error) {
      if (error instanceof ApiError && error.code.startsWith('AI_')) return { problem: AI_NOT_AVAILABLE_REPLY };
      throw error;
    }
  }

  return {
    /**
     * One step of the chat. Without a question key it only gives the first question to ask. With one it saves the reply (or skips
     * the question) and gives the next. A reply that cannot be used is not an error: the answer carries `problem` in plain words and
     * the same question comes back. A question key that is not one the chat can ask for this business answers 404; a reply that is
     * missing or empty answers 400 REPLY_NEEDED.
     */
    async reply(
      principal: Pick<Principal, 'accountId' | 'userId' | 'industryId'>,
      request: SetupChatRequest,
    ): Promise<SetupChatResponse> {
      const skippedQuestionKeys = new Set(request.skippedQuestionKeys ?? []);
      let saved: SetupChatResponse['saved'] = null;
      let problem: string | null = null;

      if (request.questionKey !== undefined) {
        const { questions: questionsBeforeReply } = await knowledgeService.listQuestions(principal);
        const question = questionsBeforeReply.find((candidate) => candidate.key === request.questionKey);
        if (!question || !isChatQuestion(question)) throw notFound('That question');

        if (request.skip === true) {
          skippedQuestionKeys.add(question.key);
        } else {
          const replyText = request.reply?.trim() ?? '';
          if (replyText === '') throw new ApiError(400, 'REPLY_NEEDED', 'Type your answer, or skip this question.');
          const read = await readReply(principal, question, replyText);
          if ('problem' in read) {
            problem = read.problem;
          } else {
            try {
              await knowledgeService.answerQuestion(principal, question.key, { value: read.value as PutAnswerRequest['value'] });
              saved = { questionKey: question.key, questionText: question.text };
            } catch (error) {
              // The question's own checks said no (a bad link, a missing detail): say why, in the checker's words, and ask again
              if (error instanceof ApiError && error.code === 'INVALID_ANSWER') problem = error.message;
              else throw error;
            }
          }
        }
      }

      const { questions, progress } = await knowledgeService.listQuestions(principal);
      const next = chooseNextChatQuestion(questions, skippedQuestionKeys);
      return {
        saved,
        problem,
        next: next === null ? null : toChatQuestion(next),
        formOnlyRemaining: countFormOnlyQuestions(questions),
        progress,
      };
    },
  };
}
