import type { AnswerType, HandledElsewhere, QuestionSection } from '@toobler-one/shared';

// The shape of a business question as it is written in code. The question lists (general-questions.ts, industry-questions.ts)
// are made of these; the answer checks, the completeness score and the API all read them.

/** One column of a "list" answer, for example the platform and the link in "Are you on any of these?". */
export interface ListRowField {
  key: string;
  label: string;
  kind: 'text' | 'long_text' | 'link' | 'price' | 'pick';
  /** The allowed words for a `pick` column. */
  options?: readonly string[];
  required: boolean;
}

/** A question that is answered "Yes" or "No" and, for "Yes", with a link or some words ("Yes, describe in words"). */
export interface YesDetail {
  kind: 'link' | 'text';
  /** True when a "Yes" must come with the link or words. */
  required: boolean;
  label: string;
}

export interface QuestionDefinition {
  /** Never changes once a business has answered: the answers are stored under it. */
  key: string;
  section: QuestionSection;
  text: string;
  type: AnswerType;
  /** The ready options of a `pick_one` or `pick_several` question. */
  options?: readonly string[];
  /** True when the person may also pick "Other" and type their own words. */
  allowOther?: boolean;
  /** For `pick_several`: the most that may be picked. */
  maxChoices?: number;
  /** For `yes_no`: the extra link or words that go with "Yes". */
  yesDetail?: YesDetail;
  /** For `list`: the columns of each row, and the most rows. */
  rowFields?: readonly ListRowField[];
  maxRows?: number;
  /** A special format check on a short text, for example the shape of a GST number. */
  check?: 'gst_number';
  /** True when the AI may not answer real customers until this is answered. */
  neededToGoLive: boolean;
  /**
   * Set for a question whose real answer lives in another feature (offerings, FAQs, documents). It is listed, so the owner sees
   * it, but it cannot be answered here and it is left out of the score and the go-live check until that feature exists.
   */
  handledElsewhere?: HandledElsewhere;
  /** Where the system will look to fill this in from (used by the website reader in F31; data only for now). */
  prefillFrom: readonly string[];
  /** What the answer is used for, when it is more than "the AI's knowledge" (for example the reports). */
  usedFor?: string;
}
