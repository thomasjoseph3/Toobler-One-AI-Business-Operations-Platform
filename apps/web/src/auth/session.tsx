import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProfileResponse } from '@toobler-one/shared';
import { apiRequest, ApiRequestError, onSessionEnded } from '../api/client';

/** Who is using the app right now. `error` means we could not find out (server down), which is not the same as signed out. */
export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'signedIn'; profile: ProfileResponse };

interface SessionContextValue {
  sessionState: SessionState;
  /** Signs in with an email and password. Throws ApiRequestError when the API refuses (wrong password, locked...). */
  signIn: (email: string, password: string) => Promise<void>;
  /** Signs out on the server, then shows the signed-out state. */
  signOut: () => Promise<void>;
  /** Asks the server again who is signed in (the "try again" button). */
  reloadSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Asks the server who is signed in (GET /me) and says what the answer means for the app. It never throws. */
async function findSessionState(): Promise<SessionState> {
  try {
    const profile = await apiRequest<ProfileResponse>('GET', '/me');
    return { status: 'signedIn', profile };
  } catch (error) {
    const isSignedOut = error instanceof ApiRequestError && error.status === 401;
    return { status: isSignedOut ? 'signedOut' : 'error' };
  }
}

/** Keeps track of who is signed in, for the whole app. It asks GET /me once at start. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });

  // The "try again" button: shows the loading state again, then asks once more.
  const reloadSession = useCallback(async () => {
    setSessionState({ status: 'loading' });
    setSessionState(await findSessionState());
  }, []);

  // Asks once at start. The page starts out "loading", and `isCancelled` stops an answer from a discarded run being used.
  useEffect(() => {
    let isCancelled = false;
    void findSessionState().then((foundState) => {
      if (!isCancelled) setSessionState(foundState);
    });
    return () => {
      isCancelled = true;
    };
  }, []);

  // When a later call finds the session ended for good, the app falls back to the sign-in page
  useEffect(() => onSessionEnded(() => setSessionState({ status: 'signedOut' })), []);

  const signIn = useCallback(async (email: string, password: string) => {
    const profile = await apiRequest<ProfileResponse>('POST', '/auth/login', { email, password });
    setSessionState({ status: 'signedIn', profile });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiRequest('POST', '/auth/logout');
    } catch {
      // Even if the server could not be told, this device must not look signed in any more
    }
    setSessionState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ sessionState, signIn, signOut, reloadSession }),
    [sessionState, signIn, signOut, reloadSession],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** The session for any component inside SessionProvider. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider.');
  return value;
}
