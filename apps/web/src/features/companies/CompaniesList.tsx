import type { Company } from '@toobler-one/shared';
import { Card, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@toobler-one/ui';
import { formatMessage, t } from '../../app/i18n';
import { formatBudget } from '../leads/lead-display';

/** The company's won value as rupees ("₹1,50,000"), or a dash when nothing is won yet. */
function describeWonValue(wonValuePaise: number): string {
  return wonValuePaise === 0 ? '–' : (formatBudget(wonValuePaise) ?? '–');
}

/** The companies as a table for tablets and desktops: name, contacts, open leads, won value and owner. */
export function CompaniesTable({ companies }: { companies: readonly Company[] }) {
  return (
    <Table className="min-w-[720px]" containerClassName="min-h-0 flex-1 overflow-auto">
      <TableHead>
        <tr>
          <TableHeaderCell>{t('companies.column.name')}</TableHeaderCell>
          <TableHeaderCell>{t('companies.column.contacts')}</TableHeaderCell>
          <TableHeaderCell>{t('companies.column.openLeads')}</TableHeaderCell>
          <TableHeaderCell>{t('companies.column.wonValue')}</TableHeaderCell>
          <TableHeaderCell>{t('companies.column.owner')}</TableHeaderCell>
        </tr>
      </TableHead>
      <TableBody>
        {companies.map((company) => (
          <TableRow key={company.id}>
            <TableCell className="text-text-primary">
              <span className="block">{company.name}</span>
              {company.city ? <span className="text-body-sm block text-text-secondary">{company.city}</span> : null}
            </TableCell>
            <TableCell>{company.contactCount}</TableCell>
            <TableCell>{company.openLeads}</TableCell>
            <TableCell className="whitespace-nowrap">{describeWonValue(company.wonValuePaise)}</TableCell>
            <TableCell>{company.owner?.name ?? t('companies.noOwner')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The companies as a list of cards for a phone, where a wide table would not fit: the same facts, stacked. */
export function CompanyCards({ companies }: { companies: readonly Company[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {companies.map((company) => (
        <li key={company.id}>
          <Card isCompact className="flex flex-col gap-2">
            <p className="text-body-md-semibold min-w-0 text-text-primary">{company.name}</p>
            {company.city ? <p className="text-body-sm text-text-secondary">{company.city}</p> : null}
            <p className="text-body-sm text-text-secondary">
              {company.contactCount === 1
                ? t('companies.stat.contactsOne')
                : formatMessage('companies.stat.contacts', { count: company.contactCount })}
              {' · '}
              {company.openLeads === 1
                ? t('companies.stat.openLeadsOne')
                : formatMessage('companies.stat.openLeads', { count: company.openLeads })}
            </p>
            {company.wonValuePaise > 0 ? (
              <p className="text-body-sm text-text-secondary">
                {formatMessage('companies.stat.wonValue', { amount: describeWonValue(company.wonValuePaise) })}
              </p>
            ) : null}
            <p className="text-body-sm text-text-secondary">
              {formatMessage('companies.stat.owner', { name: company.owner?.name ?? t('companies.noOwner') })}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
