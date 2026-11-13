// Developer-only page (/dev/ui): every design-system piece in one place. Use the theme switch in the top bar to see
// both themes. It is not part of the product, so its text is written directly instead of going through t().
import { useState } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ActionMenu,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  LogoOne,
  Pagination,
  Popover,
  SelectField,
  SidePanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tag,
  TextAreaField,
  TextField,
  ActivitiesIcon,
  ActivityIcon,
  AddNoteIcon,
  AiAgentIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  CompaniesIcon,
  ContactsIcon,
  ExportIcon,
  FilterIcon,
  FollowUpsIcon,
  ImportIcon,
  LeadsIcon,
  ListViewIcon,
  LogoOneMark,
  ManageColumnsIcon,
  MoonIcon,
  MoreIcon,
  PhoneIcon,
  PlusIcon,
  ReportsIcon,
  SearchIcon,
  SettingsIcon,
  SharedInboxIcon,
  SidebarToggleIcon,
  SortIcon,
  PipelineViewIcon,
  TasksIcon,
  TicketsIcon,
  TodayIcon,
  WhatsappIcon,
} from '@toobler-one/ui';

/** Every icon from the Figma frame, with its component name, for the gallery. */
const ICON_EXAMPLES = [
  { name: 'ActivitiesIcon', Component: ActivitiesIcon },
  { name: 'ActivityIcon', Component: ActivityIcon },
  { name: 'AddNoteIcon', Component: AddNoteIcon },
  { name: 'AiAgentIcon', Component: AiAgentIcon },
  { name: 'BellIcon', Component: BellIcon },
  { name: 'CalendarIcon', Component: CalendarIcon },
  { name: 'CheckIcon', Component: CheckIcon },
  { name: 'CompaniesIcon', Component: CompaniesIcon },
  { name: 'ContactsIcon', Component: ContactsIcon },
  { name: 'ExportIcon', Component: ExportIcon },
  { name: 'FilterIcon', Component: FilterIcon },
  { name: 'FollowUpsIcon', Component: FollowUpsIcon },
  { name: 'ImportIcon', Component: ImportIcon },
  { name: 'LeadsIcon', Component: LeadsIcon },
  { name: 'ListViewIcon', Component: ListViewIcon },
  { name: 'ManageColumnsIcon', Component: ManageColumnsIcon },
  { name: 'MoonIcon', Component: MoonIcon },
  { name: 'MoreIcon', Component: MoreIcon },
  { name: 'PhoneIcon', Component: PhoneIcon },
  { name: 'PlusIcon', Component: PlusIcon },
  { name: 'ReportsIcon', Component: ReportsIcon },
  { name: 'SearchIcon', Component: SearchIcon },
  { name: 'SettingsIcon', Component: SettingsIcon },
  { name: 'SharedInboxIcon', Component: SharedInboxIcon },
  { name: 'SidebarToggleIcon', Component: SidebarToggleIcon },
  { name: 'SortIcon', Component: SortIcon },
  { name: 'LogoOneMark', Component: LogoOneMark },
  { name: 'PipelineViewIcon', Component: PipelineViewIcon },
  { name: 'TasksIcon', Component: TasksIcon },
  { name: 'TicketsIcon', Component: TicketsIcon },
  { name: 'TodayIcon', Component: TodayIcon },
  { name: 'WhatsappIcon', Component: WhatsappIcon },
];

const COLOR_TOKENS = [
  'canvas',
  'header',
  'surface',
  'surface-subtle',
  'input',
  'hover',
  'selected',
  'disabled',
  'sidebar',
  'sidebar-item-active-bg',
  'border-subtle',
  'border-default',
  'border-strong',
  'border-emphasis',
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'text-disabled',
  'icon-primary',
  'icon-secondary',
  'link',
  'focus',
  'action',
  'action-hover',
  'action-pressed',
  'card-header-lavender',
  'card-header-peach',
  'card-header-neutral',
  'success',
  'success-bg',
  'warning',
  'warning-bg',
  'error',
  'error-bg',
  'info',
  'info-bg',
  'tag-stage-new',
  'tag-stage-contacted',
  'tag-stage-qualified',
  'tag-stage-rate-sent',
  'tag-stage-won',
  'tag-stage-lost',
  'chart-series-1',
  'chart-series-2',
  'chart-series-3',
  'chart-series-4',
];

const TEXT_STYLES = [
  'text-heading-3xl',
  'text-heading-2xl',
  'text-heading-lg',
  'text-heading-md',
  'text-heading-sm',
  'text-body-lg',
  'text-body-md',
  'text-body-sm',
  'text-label-sm',
  'text-body-md-semibold',
  'text-body-sm-medium',
  'text-body-xs',
  'text-label-xs',
  'text-label-xs-semibold',
  'text-label-xs-caps',
];

/** A titled block of the gallery. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-6">
      <h2 className="text-heading-md mb-4 text-text-primary">{title}</h2>
      {children}
    </Card>
  );
}

/** Shows every component and token of the design system on one page. */
export function UiGallery() {
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  return (
    <>
      <p className="text-body-md mb-6 text-text-secondary">
        Every design-system piece. Switch Light, Dark or System with the moon button in the top bar.
      </p>

      <Section title="Colours">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {COLOR_TOKENS.map((tokenName) => (
            <li key={tokenName} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-8 shrink-0 rounded-md border border-border-default"
                style={{ backgroundColor: `var(--color-${tokenName})` }}
              />
              <span className="text-body-xs text-text-secondary">{tokenName}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Text styles">
        <div className="flex flex-col gap-2">
          {TEXT_STYLES.map((styleName) => (
            <p key={styleName} className={`${styleName} text-text-primary`}>
              {styleName}: The quick brown fox, ₹1,20,000
            </p>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" leadingIcon={<PlusIcon />}>
            Primary
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tertiary">Tertiary</Button>
          <Button variant="destructive" leadingIcon={<Trash2 aria-hidden className="size-4" />}>
            Destructive
          </Button>
          <Button variant="link">Link</Button>
          <Button variant="primary" isLoading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button variant="primary" size="touch">
            Touch size (44 px)
          </Button>
          <IconButton label="Add" icon={<PlusIcon size={20} />} />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="error">Error</Badge>
          <Badge tone="info">Information</Badge>
          <Badge icon={<Sparkles aria-hidden className="size-3" />}>AI agent</Badge>
        </div>
      </Section>

      <Section title="Logo and icons">
        <div className="mb-4 inline-flex rounded-lg bg-sidebar p-4">
          <LogoOne className="text-sidebar-logo" />
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {ICON_EXAMPLES.map(({ name, Component }) => (
            <li key={name} className="flex items-center gap-2">
              <Component size={20} className="shrink-0 text-icon-secondary" />
              <span className="text-body-xs text-text-secondary">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Lead-stage tags">
        <div className="flex flex-wrap gap-2">
          <Tag tone="new">New</Tag>
          <Tag tone="contacted">Contacted</Tag>
          <Tag tone="qualified">Qualified</Tag>
          <Tag tone="rate-sent">Rate sent</Tag>
          <Tag tone="won">Won</Tag>
          <Tag tone="lost">Lost</Tag>
        </div>
      </Section>

      <Section title="Table and pagination">
        <Card isFlush>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell className="w-12">
                  <Checkbox label="Select all" isLabelHidden />
                </TableHeaderCell>
                <TableHeaderCell>Lead name</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              <TableRow isSelected>
                <TableCell>
                  <Checkbox label="Select Priya Menon" isLabelHidden defaultChecked />
                </TableCell>
                <TableCell className="text-text-primary">Priya Menon (selected row)</TableCell>
                <TableCell>+91 98470 11201</TableCell>
                <TableCell>
                  <Tag tone="new">New</Tag>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Checkbox label="Select Arjun Nair" isLabelHidden />
                </TableCell>
                <TableCell className="text-text-primary">Arjun Nair</TableCell>
                <TableCell>+91 98950 22302</TableCell>
                <TableCell>
                  <Tag tone="contacted">Contacted</Tag>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Pagination
            summary="Showing 1–2 of 28 open leads"
            previousLabel="Previous"
            nextLabel="Next"
            ariaLabel="Example pages"
            hasPrevious={false}
            hasNext
            onPrevious={() => undefined}
            onNext={() => undefined}
          />
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <Tag tone="neutral">Neutral tag (extra stage)</Tag>
          <Button size="compact">Compact button</Button>
        </div>
      </Section>

      <Section title="Drop-down and panel">
        <div className="flex flex-wrap items-start gap-4">
          <SelectField
            className="w-60"
            label="Stage"
            options={[
              { value: '', label: 'Any stage' },
              { value: 'new', label: 'New' },
              { value: 'quoted', label: 'Quoted' },
            ]}
          />
          <Popover
            panelLabel="Example panel"
            renderTrigger={({ isOpen, toggle }) => (
              <Button size="compact" aria-haspopup="dialog" aria-expanded={isOpen} onClick={toggle}>
                Open a panel
              </Button>
            )}
          >
            <SelectField label="Sort by" options={[{ value: 'a', label: 'Date added' }]} />
          </Popover>
        </div>
      </Section>

      <Section title="Alerts, text area and side panel">
        <div className="flex max-w-xl flex-col gap-3">
          <Alert tone="error">The email or password is not right.</Alert>
          <Alert tone="success">Lead created for Priya Menon.</Alert>
          <TextAreaField label="What do they want?" requirementLabel="Optional" placeholder="Family room, 3 nights" />
          <div>
            <Button onClick={() => setIsSidePanelOpen(true)}>Open the side panel</Button>
          </div>
        </div>
        <SidePanel
          isOpen={isSidePanelOpen}
          onClose={() => setIsSidePanelOpen(false)}
          title="Example panel"
          closeLabel="Close"
          footer={<Button onClick={() => setIsSidePanelOpen(false)}>Cancel</Button>}
        >
          <p className="text-body-md text-text-secondary">A form goes here. On a phone this fills the screen.</p>
        </SidePanel>
      </Section>

      <Section title="Row menu, dialog and confirmation">
        <div className="flex flex-wrap items-center gap-3">
          <ActionMenu
            triggerLabel="More actions for the example row"
            panelLabel="Example actions"
            groupHeadings={{ move: 'Move to', owner: 'Owner' }}
            items={[
              { id: 'a', label: 'Contacted', group: 'move', onSelect: () => undefined },
              { id: 'b', label: 'Quoted', group: 'move', onSelect: () => undefined },
              { id: 'c', label: 'Assign to me', group: 'owner', onSelect: () => undefined },
              { id: 'd', label: 'Delete lead', group: 'delete', tone: 'danger', onSelect: () => undefined },
            ]}
          />
          <Button onClick={() => setIsDialogOpen(true)}>Open a dialog</Button>
          <Button variant="destructive" onClick={() => setIsConfirmOpen(true)}>
            Open the delete confirmation
          </Button>
        </div>
        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Example dialog"
          closeLabel="Close"
          footer={<Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>}
        >
          <p className="text-body-md text-text-secondary">A short question or form goes here.</p>
        </Dialog>
        <ConfirmDialog
          isOpen={isConfirmOpen}
          tone="danger"
          title="Delete the lead for Priya Menon?"
          description="The lead is removed from your lists. The person stays in your contacts."
          confirmLabel="Delete lead"
          cancelLabel="Cancel"
          closeLabel="Close"
          onConfirm={() => setIsConfirmOpen(false)}
          onCancel={() => setIsConfirmOpen(false)}
        />
      </Section>

      <Section title="Checkboxes">
        <div className="flex flex-wrap items-center gap-6">
          <Checkbox label="Unchecked" />
          <Checkbox label="Checked" defaultChecked />
          <Checkbox label="Disabled" disabled />
          <Checkbox label="Select this row (label hidden)" isLabelHidden />
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid max-w-md gap-4">
          <TextField label="Name" placeholder="Anita Nair" helperText="As the customer gave it." />
          <TextField label="Phone" requirementLabel="Optional" placeholder="+91 98470 12345" />
          <TextField
            label="Email"
            defaultValue="anita@"
            errorMessage="Enter a full email address, like anita@example.com."
          />
          <TextField label="Source" defaultValue="WhatsApp" readOnly />
          <TextField label="Notes" disabled defaultValue="Disabled" />
        </div>
      </Section>

      <Section title="Empty, error and loading states">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <EmptyState
              icon={<PlusIcon size={24} />}
              title="No leads yet"
              description="Leads appear here when a customer calls or messages."
              action={<Button variant="primary">Add a lead</Button>}
            />
          </Card>
          <Card>
            <ErrorState
              title="Could not load leads"
              description="Something went wrong on our side. Your data is safe."
              action={<Button>Try again</Button>}
            />
          </Card>
          <Card>
            <LoadingState label="Loading leads" rows={3} />
          </Card>
        </div>
      </Section>
    </>
  );
}
