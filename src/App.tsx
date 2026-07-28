import { useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { setUnauthorizedHandler } from "./api/strapi";
import { Login } from "./components/Login";
import { AppShell } from "./AppShell";
import styles from "./styles/app.module.scss";

export function App() {
  const auth = useAuth();

  useEffect(() => {
    setUnauthorizedHandler(auth.invalidate);
    return () => setUnauthorizedHandler(null);
  }, [auth.invalidate]);

  if (auth.loading) {
    return <div className={styles.splash}>Lade…</div>;
  }

  if (!auth.user) {
    return <Login onLogin={auth.login} />;
  }

  return (
    <>
      <AppShell user={auth.user} onLogout={auth.logout} />
      {auth.sessionExpired && (
        <Login onLogin={auth.login} overlay initialEmail={auth.user.email} />
      )}
    </>
  );
}
