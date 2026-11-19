import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWindow } from './ChatWindow';
import './chat.css';

/** The widget key the page was opened with (`/widget/chat?key=wk_...`), or null when it is missing. */
function readWidgetKey(): string | null {
  const key = new URLSearchParams(window.location.search).get('key');
  return key !== null && /^wk_[A-Za-z0-9_-]{32}$/.test(key) ? key : null;
}

const rootElement = document.getElementById('root');
if (rootElement)
  createRoot(rootElement).render(
    <StrictMode>
      <ChatWindow widgetKey={readWidgetKey()} />
    </StrictMode>,
  );
