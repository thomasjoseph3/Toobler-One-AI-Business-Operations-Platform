import { describe, expect, it } from 'vitest';
import { describeAnswerSources } from './describe-answer-sources';

const worked = (toolName: string, result: string) => ({ toolName, input: {}, ok: true, result });

describe('describeAnswerSources', () => {
  it('names the offerings, the business profile and each FAQ the answer came from', () => {
    const sources = describeAnswerSources([
      worked('list_offerings', '...'),
      worked('get_business_info', '...'),
      worked(
        'search_knowledge',
        'Question: Do you have parking?\nAnswer: Yes.\n\nQuestion: Is breakfast included?\nAnswer: Yes.',
      ),
    ]);
    expect(sources).toEqual([
      { kind: 'offerings', label: 'Offerings and offers' },
      { kind: 'business_info', label: 'Business profile' },
      { kind: 'faq', label: 'Do you have parking?' },
      { kind: 'faq', label: 'Is breakfast included?' },
    ]);
  });

  it('names a place once, however often it was looked at', () => {
    expect(describeAnswerSources([worked('list_offerings', 'a'), worked('list_offerings', 'b')])).toHaveLength(1);
  });

  it('says nothing for a search that found nothing, a tool that failed, or a tool that only saves', () => {
    expect(
      describeAnswerSources([
        worked('search_knowledge', 'Nothing found. Say you are not sure...'),
        { toolName: 'list_offerings', input: {}, ok: false, result: 'failed' },
        worked('save_details', 'Saved.'),
      ]),
    ).toEqual([]);
  });
});
