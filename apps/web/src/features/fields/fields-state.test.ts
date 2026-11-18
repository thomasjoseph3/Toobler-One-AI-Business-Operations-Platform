import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../../api/client';
import {
  buildCreateFieldRequest,
  buildEmptyFieldForm,
  checkFieldForm,
  describeFieldProblem,
  describeFieldType,
  readOptions,
} from './fields-state';

describe('the Add field form', () => {
  it('starts as an empty text field with both switches off', () => {
    expect(buildEmptyFieldForm()).toEqual({
      label: '',
      type: 'text',
      optionsText: '',
      aiAsks: false,
      requiredForWon: false,
    });
  });

  it('asks for a label, and for choices when the type is a dropdown', () => {
    expect(checkFieldForm(buildEmptyFieldForm())).toEqual({ label: 'fields.form.problem.label' });
    const dropdown = { ...buildEmptyFieldForm(), label: 'Car model', type: 'dropdown' as const };
    expect(checkFieldForm(dropdown)).toEqual({ options: 'fields.form.problem.optionsNeeded' });
    expect(checkFieldForm({ ...dropdown, optionsText: 'Swift\nBaleno' })).toEqual({});
    const tooMany = Array.from({ length: 31 }, (_, index) => `Choice ${index}`).join('\n');
    expect(checkFieldForm({ ...dropdown, optionsText: tooMany })).toEqual({
      options: 'fields.form.problem.optionsTooMany',
    });
  });

  it('reads the choices one to a line, tidied', () => {
    expect(readOptions(' Swift \n\nbaleno\nBaleno\n Brezza ')).toEqual(['Swift', 'baleno', 'Brezza']);
  });

  it('builds the request: choices only for a dropdown, "required before Won" only for a lead', () => {
    const fields = {
      label: ' Car model ',
      type: 'dropdown' as const,
      optionsText: 'Swift\nBaleno',
      aiAsks: true,
      requiredForWon: true,
    };
    expect(buildCreateFieldRequest(fields, 'lead')).toEqual({
      object: 'lead',
      label: 'Car model',
      type: 'dropdown',
      options: ['Swift', 'Baleno'],
      aiAsks: true,
      requiredForWon: true,
    });
    expect(buildCreateFieldRequest({ ...fields, type: 'text' }, 'contact')).toEqual({
      object: 'contact',
      label: 'Car model',
      type: 'text',
      aiAsks: true,
      requiredForWon: false,
    });
  });
});

describe('words', () => {
  it('names the types', () => {
    expect(describeFieldType('yes_no')).toBe('Yes/No');
    expect(describeFieldType('dropdown')).toBe('Dropdown');
  });

  it('shows the API’s own words for a 409 and a general sentence for anything else', () => {
    expect(describeFieldProblem(new ApiRequestError(409, 'FIELD_LIMIT', 'You can have at most 50 fields here.'))).toBe(
      'You can have at most 50 fields here.',
    );
    expect(describeFieldProblem(new ApiRequestError(500, 'UNKNOWN_ERROR', 'boom'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(describeFieldProblem(new ApiRequestError(0, 'NETWORK_ERROR', 'x'))).toContain('connect');
  });
});
