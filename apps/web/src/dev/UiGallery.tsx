// Developer-only page (/dev/ui): every design-system piece in one place. Use the theme switch in the top bar to see
// both themes. It is not part of the product, so its text is written directly instead of going through t().
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  PageHeader,
  TextField,
} from '@toobler-one/ui';

const COLOR_TOKENS = [
  'canvas',
  'surface',
  'surface-muted',
  'surface-hover',
  'border',
  'border-strong',
  'text-primary',
  'text-secondary',
  'text-muted',
  'text-disabled',
  'action',
  'action-hover',
  'action-pressed',
  'action-subtle',
  'focus-ring',
  'success',
  'success-bg',
  'warning',
  'warning-bg',
  'error',
  'error-bg',
  'info',
  'info-bg',
];

const TEXT_STYLES = [
  'text-4xl-display',
  'text-2xl-page-title',
  'text-xl-section-title',
  'text-lg-subsection-title',
  'text-base-heading',
  'text-base-body',
  'text-sm-body',
  'text-xs-supporting',
  'text-xs-label',
  'text-sm-button',
  'text-xs-navigation',
  'text-xs-caption',
  'text-11-compact',
  'text-11-caps',
];

/** A titled block of the gallery. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mb-6">
      <h2 className="text-lg-subsection-title mb-4 text-text-primary">{title}</h2>
      {children}
    </Card>
  );
}

/** Shows every component and token of the design system on one page. */
export function UiGallery() {
  return (
    <>
      <PageHeader
        title="UI gallery"
        description="Every design-system piece. Switch Light, Dark or System in the top bar."
      />

      <Section title="Colours">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {COLOR_TOKENS.map((tokenName) => (
            <li key={tokenName} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-8 shrink-0 rounded-md border border-border-strong"
                style={{ backgroundColor: `var(--color-${tokenName})` }}
              />
              <span className="text-xs-caption text-text-secondary">{tokenName}</span>
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
          <Button variant="primary" leadingIcon={<Plus aria-hidden className="size-4" />}>
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
          <IconButton label="Add" icon={<Plus aria-hidden className="size-5" />} />
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
              icon={<Plus aria-hidden className="size-6" />}
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
