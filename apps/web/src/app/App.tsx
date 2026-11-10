import { BrowserRouter, Route, Routes } from 'react-router';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { NAVIGATION_ITEMS } from './navigation';
import { Shell } from './shell/Shell';
import { ThemeProvider } from './theme';

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
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
