import { expect, test } from './support';

// Custom field answers on a contact's own page (F09 slice 3), against the pretend API.

test.describe('Contact page: custom fields', () => {
  test('shows the answers to the contact fields, and shows a dash for a field with no answer', async ({
    page,
    pretendApi,
  }) => {
    pretendApi.fields.fields.push({
      id: 'field-9',
      object: 'contact',
      key: 'guests',
      label: 'Guests',
      type: 'number',
      options: [],
      aiAsks: false,
      requiredForWon: false,
    });
    await page.goto('/contacts/contact-0');
    const details = page.locator('dl').first();
    await expect(details.getByText('Birthday')).toBeVisible();
    await expect(details.getByText('1990-05-04')).toBeVisible();
    await expect(details.getByText('Guests')).toBeVisible();
  });

  test('changes an answer from the Edit panel, sending only the custom field that changed', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/contacts/contact-0');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Birthday').fill('1991-02-03');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect
      .poll(() => pretendApi.notes.patchedContacts)
      .toEqual([{ contactId: 'contact-0', body: { custom: { birthday: '1991-02-03' } } }]);
  });
});
