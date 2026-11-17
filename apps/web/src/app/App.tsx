import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { KnowledgePage } from '../features/knowledge/KnowledgePage';
import { LeadPage } from '../features/leads/LeadPage';
import { LeadsPage } from '../features/leads/LeadsPage';
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
  if (item.id === 'knowledge') return <KnowledgePage />;
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
                  <Route
                    key={item.id}
                    path={item.path}
                    element={pageFor(item)}
                  />
                ))}
                <Route path="/leads/:leadId" element={<LeadPage />} />
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
