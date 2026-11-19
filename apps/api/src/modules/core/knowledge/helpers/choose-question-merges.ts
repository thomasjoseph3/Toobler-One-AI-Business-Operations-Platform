// Decides which unanswered questions are the same question asked in different words. Pure: no database, no I/O.

/** An open unanswered question, with the key made of its meaningful words (see `wordKey`). */
export interface QuestionToCompare {
  id: string;
  count: number;
  lastAskedAt: Date;
  createdAt: Date;
  /**
   * The question's meaningful words, in their root form, sorted and joined by spaces. "Is parking available?" and "Available parking?"
   * both give "avail park", so word order and filler words do not matter. Empty when the question has no meaningful word.
   */
  wordKey: string;
}

/** Questions to join into one: the one that stays, the ones joined into it, and the totals the staying one takes over. */
export interface QuestionMerge {
  keeperId: string;
  absorbedIds: string[];
  totalCount: number;
  lastAskedAt: Date;
}

/**
 * Finds the groups of questions that have exactly the same meaningful words and says how to join each group. The rule is deliberately
 * strict: only an identical set of words joins, so two different questions ("room 101 price" and "room 102 price") are never joined by
 * mistake. In each group the most asked question stays (the oldest if tied); it takes over the counts and the latest time.
 */
export function chooseQuestionMerges(questions: readonly QuestionToCompare[]): QuestionMerge[] {
  const groups = new Map<string, QuestionToCompare[]>();
  for (const question of questions) {
    if (question.wordKey === '') continue;
    const group = groups.get(question.wordKey) ?? [];
    group.push(question);
    groups.set(question.wordKey, group);
  }

  const merges: QuestionMerge[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ranked = [...group].sort(
      (first, second) =>
        second.count - first.count ||
        first.createdAt.getTime() - second.createdAt.getTime() ||
        first.id.localeCompare(second.id),
    );
    const keeper = ranked[0]!;
    const absorbed = ranked.slice(1);
    merges.push({
      keeperId: keeper.id,
      absorbedIds: absorbed.map((question) => question.id),
      totalCount: group.reduce((total, question) => total + question.count, 0),
      lastAskedAt: new Date(Math.max(...group.map((question) => question.lastAskedAt.getTime()))),
    });
  }
  return merges;
}
