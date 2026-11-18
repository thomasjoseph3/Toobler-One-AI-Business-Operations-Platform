import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ChannelsPage } from '../features/channels/ChannelsPage';
import { FaqsPage } from '../features/faqs/FaqsPage';
import { KnowledgePage } from '../features/knowledge/KnowledgePage';
import { ContactPage } from '../features/contacts/ContactPage';
import { SetupChatPage } from '../features/setup/SetupChatPage';
import { TicketPage } from '../features/tickets/TicketPage';
import { TicketsPage } from '../features/tickets/TicketsPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { LeadPage } from '../features/leads/LeadPage';
import { LeadsPage } from '../features/leads/LeadsPage';
import { ModulesPage } from '../features/settings/ModulesPage';
import { SettingsAiPage } from '../features/settings/SettingsAiPage';
import { TeamPage } from '../features/team/TeamPage';
import { SetupPage } from '../features/setup/SetupPage';
import { WhatYouSellPage } from '../features/what-you-sell/WhatYouSellPage';
import { TestAgentPage } from '../features/test-agent/TestAgentPage';
import { RequireSignIn } from '../auth/RequireSignIn';
import { SessionProvider } from '../auth/session';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { SignInPage } from '../pages/SignInPage';
import { AuthLayout } from './AuthLayout';
import { NAVIGATION_ITEMS, type NavigationItem } from './navigation';
import { Shell } from './shell/Shell';
import { ThemeProvider } from './theme';

// The UI gallery is for developers only. `import.meta.env.DEV` is false in a production build, so this whole branch,
// including the gallery's code, is removed from what we ship.
const UiGallery = import.meta.env.DEV
  ? lazy(() => import('../dev/UiGallery').then((module) => ({ default: module.UiGallery })))
  : null;

/** The page for one menu entry: its real screen when it has one, otherwise the "not built yet" page. */
function pageFor(item: NavigationItem) {
  if (item.id === 'leads') return <LeadsPage />;
  if (item.id === 'contacts') return <ContactsPage />;
  if (item.id === 'tickets') return <TicketsPage />;
  if (item.id === 'tasks') return <TasksPage />;
  if (item.id === 'knowledge') return <KnowledgePage />;
  if (item.id === 'setup') return <SetupPage />;
  if (item.id === 'channels') return <ChannelsPage />;
  if (item.id === 'settings') return <SettingsAiPage />;
  return <PlaceholderPage item={item} />;
}

/** The whole staff app: theme, who is signed in, the sign-in page, and (behind the guard) the page frame with one route for each menu entry. */
export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SessionProvider>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/sign-in" element={<SignInPage />} />
            </Route>
            <Route element={<RequireSignIn />}>
              <Route element={<Shell />}>
                {NAVIGATION_ITEMS.map((item) => (
                  <Route key={item.id} path={item.path} element={pageFor(item)} />
                ))}
                <Route path="/leads/:leadId" element={<LeadPage />} />
                <Route path="/contacts/:contactId" element={<ContactPage />} />
                <Route path="/tickets/:ticketId" element={<TicketPage />} />
                <Route path="/setup/chat" element={<SetupChatPage />} />
                <Route path="/knowledge/test-agent" element={<TestAgentPage />} />
                <Route path="/knowledge/what-you-sell" element={<WhatYouSellPage />} />
                <Route path="/knowledge/faqs" element={<FaqsPage />} />
                <Route path="/settings/modules" element={<ModulesPage />} />
                <Route path="/settings/team" element={<TeamPage />} />
                {UiGallery ? (
                  <Route
                    path="/dev/ui"
                    element={
                      <Suspense fallback={null}>
                        <UiGallery />
                      </Suspense>
                    }
                  />
                ) : null}
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </SessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
