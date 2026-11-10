import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { NAVIGATION_ITEMS } from './navigation';
import { Shell } from './shell/Shell';
import { ThemeProvider } from './theme';

// The UI gallery is for developers only. `import.meta.env.DEV` is false in a production build, so this whole branch,
// including the gallery's code, is removed from what we ship.
const UiGallery = import.meta.env.DEV
  ? lazy(() => import('../dev/UiGallery').then((module) => ({ default: module.UiGallery })))
  : null;

/** The whole staff app: theme, the page frame, and one route for each menu entry. */
export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            {NAVIGATION_ITEMS.map((item) => (
              <Route key={item.id} path={item.path} element={<PlaceholderPage item={item} />} />
            ))}
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
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
