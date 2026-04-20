import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

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
