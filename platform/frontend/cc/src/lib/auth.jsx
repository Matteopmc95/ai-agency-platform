import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { getUserName } from './utils';

const ADMIN_EMAIL = 'matteo@parkingmycar.it';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = caricamento iniziale

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={session}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSession() {
  return useContext(AuthContext);
}

export function useIsAdmin() {
  const session = useSession();
  return session?.user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
}

export function useUserProfile() {
  const session = useSession();

  return useMemo(() => {
    const email = session?.user?.email || '';
    return {
      email,
      name: getUserName(email),
    };
  }, [session]);
}
