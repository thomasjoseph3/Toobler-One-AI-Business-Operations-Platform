import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './support';

// Settings → Team in a real browser, at phone and desktop size, against the pretend API (e2e/pretend-team.ts): the people, the waiting
// invitations, the Invite form, and the page being for managers only.

test.describe('Settings: Team', () => {
  test('lists the people with their roles and the invitations waiting', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(
      page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Team' }),
    ).toHaveAttribute('aria-current', 'page');
    const people = page.getByRole('region', { name: 'People' });
    await expect(people.getByRole('heading', { name: 'Anita Nair' })).toBeVisible();
    await expect(people.getByText('You', { exact: true })).toBeVisible();
    await expect(people.getByText('Manager', { exact: true })).toBeVisible();
    await expect(people.getByRole('heading', { name: 'Rahul Das' })).toBeVisible();
    await expect(people.getByText('Has not signed in yet')).toBeVisible();
    const waiting = page.getByRole('region', { name: 'Invitations waiting' });
    await expect(waiting.getByRole('heading', { name: 'Meera Pillai' })).toBeVisible();
    await expect(waiting.getByText('Staff (own leads only)')).toBeVisible();
    await expect(waiting.getByText(/Link works until/)).toBeVisible();
  });

  test('invites a person and offers the link to copy', async ({ page, pretendApi }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'Invite a person' }).click();
    await page.getByLabel('Name').fill('Hari Kumar');
    await page.getByLabel('Email').fill('Hari@Example.com');
    await page.getByLabel('Role').selectOption('staff_own');
    await expect(page.getByText('Like Staff, but sees only the leads given to them.')).toBeVisible();
    await page.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByText('Invitation sent to hari@example.com. The link works for 48 hours.')).toBeVisible();
    expect(pretendApi.team.postedInvitations).toEqual([
      { name: 'Hari Kumar', email: 'Hari@Example.com', role: 'staff_own' },
    ]);
    // The new invitation is in the waiting list
    await expect(
      page.getByRole('region', { name: 'Invitations waiting' }).getByRole('heading', { name: 'Hari Kumar' }),
    ).toBeVisible();
    // The link is shown in words too, so it can be selected even where copying is not allowed
    await expect(page.getByText('http://localhost:3000/accept-invitation?token=abc123def456ghi789jkl')).toBeVisible();
    await page.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  });

  test('says when the email could not be sent, and still offers the link', async ({ page, pretendApi }) => {
    pretendApi.team.emailWorks = false;
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'Invite a person' }).click();
    await page.getByLabel('Name').fill('Hari Kumar');
    await page.getByLabel('Email').fill('hari@example.com');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(/the email could not be sent/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  test('checks the form on the device and keeps what was typed when the API refuses', async ({ page, pretendApi }) => {
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'Invite a person' }).click();
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Enter the person’s name.')).toBeVisible();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    expect(pretendApi.team.postedInvitations).toEqual([]);

    pretendApi.team.refusal = {
      status: 409,
      code: 'ALREADY_INVITED',
      message: 'This person already has an invitation waiting. Cancel it or send it again.',
    };
    await page.getByLabel('Name').fill('Meera Pillai');
    await page.getByLabel('Email').fill('meera@example.com');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('alert')).toContainText('This person already has an invitation waiting.');
    await expect(page.getByLabel('Name')).toHaveValue('Meera Pillai');
  });

  test('changes a person’s role from their menu', async ({ page, pretendApi }) => {
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'More actions for Rahul Das' }).click();
    await page.getByRole('button', { name: 'Make Manager' }).click();
    await expect(page.getByText('Rahul Das is now Manager.')).toBeVisible();
    expect(pretendApi.team.patchedMembers).toEqual([{ memberId: 'member-staff-1', body: { role: 'manager' } }]);
    await expect(page.getByRole('region', { name: 'People' }).getByText('Manager', { exact: true })).toHaveCount(2);
  });

  test('has no menu on your own row', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(page.getByRole('button', { name: 'More actions for Anita Nair' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More actions for Rahul Das' })).toBeVisible();
  });

  test('asks "Are you sure?" naming the person, hands their work to the chosen person, and can add them back', async ({
    page,
    pretendApi,
  }) => {
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'More actions for Rahul Das' }).click();
    await page.getByRole('button', { name: 'Remove from the team' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove Rahul Das?' });
    await expect(dialog.getByText(/will no longer be able to sign in/)).toBeVisible();
    // Cancelling changes nothing
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(pretendApi.team.removedMembers).toEqual([]);

    await page.getByRole('button', { name: 'More actions for Rahul Das' }).click();
    await page.getByRole('button', { name: 'Remove from the team' }).click();
    await dialog.getByLabel('Hand their open work to').selectOption({ label: 'Anita Nair' });
    await dialog.getByRole('button', { name: 'Remove Rahul Das' }).click();
    await expect(page.getByText('Rahul Das was removed. Their open work went to Anita Nair.')).toBeVisible();
    expect(pretendApi.team.removedMembers).toEqual([
      { memberId: 'member-staff-1', handOverTo: '0191f0a0-0000-7000-8000-000000000001' },
    ]);
    await expect(page.getByText('Removed', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'More actions for Rahul Das' }).click();
    await page.getByRole('button', { name: 'Add back' }).click();
    await expect(page.getByText('Rahul Das is back in the team.')).toBeVisible();
    await expect(page.getByText('Removed', { exact: true })).toHaveCount(0);
  });

  test('sends a waiting invitation again and offers its new link', async ({ page, pretendApi }) => {
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'More actions for the invitation to Meera Pillai' }).click();
    await page.getByRole('button', { name: 'Send again' }).click();
    await expect(page.getByText('Invitation sent to meera@example.com. The link works for 48 hours.')).toBeVisible();
    await expect(
      page.getByText('http://localhost:3000/accept-invitation?token=resent123456789abcdefghij'),
    ).toBeVisible();
    expect(pretendApi.team.resentInvitationIds).toEqual(['invitation-1']);
  });

  test('asks before cancelling an invitation, naming the person', async ({ page, pretendApi }) => {
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'More actions for the invitation to Meera Pillai' }).click();
    await page.getByRole('button', { name: 'Cancel invitation' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel the invitation to Meera Pillai?' });
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    expect(pretendApi.team.cancelledInvitationIds).toEqual([]);

    await page.getByRole('button', { name: 'More actions for the invitation to Meera Pillai' }).click();
    await page.getByRole('button', { name: 'Cancel invitation' }).click();
    await dialog.getByRole('button', { name: 'Cancel invitation' }).click();
    await expect(page.getByText('The invitation to Meera Pillai was cancelled.')).toBeVisible();
    expect(pretendApi.team.cancelledInvitationIds).toEqual(['invitation-1']);
    await expect(page.getByText('No invitations are waiting.')).toBeVisible();
  });

  test('says in the API’s words when a change is refused', async ({ page, pretendApi }) => {
    pretendApi.team.refusal = {
      status: 409,
      code: 'LAST_MANAGER',
      message: 'The business needs at least one manager. Make someone else a manager first.',
    };
    await page.goto('/settings/team');
    await page.getByRole('button', { name: 'More actions for Rahul Das' }).click();
    await page.getByRole('button', { name: 'Make Manager' }).click();
    await expect(page.getByRole('alert')).toContainText('The business needs at least one manager.');
  });

  test('shows an error with a retry when the team cannot be loaded', async ({ page, pretendApi }) => {
    pretendApi.team.fails = true;
    await page.goto('/settings/team');
    await expect(page.getByText('We could not load your team')).toBeVisible();
    pretendApi.team.fails = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Rahul Das' })).toBeVisible();
  });

  test('staff do not see the Team tab', async ({ page, pretendApi }) => {
    pretendApi.role = 'staff';
    await page.goto('/settings');
    const tabs = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(tabs.getByRole('link', { name: 'Modules' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Team' })).toHaveCount(0);
  });

  test('has no accessibility violations', async ({ page }) => {
    await page.goto('/settings/team');
    await expect(page.getByRole('heading', { name: 'Rahul Das' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.length}`)).toEqual([]);
  });
});
