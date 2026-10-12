import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me } from "./api";
import { AuthPage } from "./pages/AuthPage";
import { SetupWizard } from "./pages/SetupWizard";
import { Dashboard } from "./pages/Dashboard";

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCompany, setEditingCompany] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/me"));
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) console.error(error);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setMe(null);
  };

  if (loading) return <div className="center muted">Lädt …</div>;
  if (!me) return <AuthPage onDone={refresh} />;

  const canEdit = me.user.role !== "staff";
  if ((!me.setupComplete && canEdit) || editingCompany)
    return (
      <SetupWizard
        firstRun={!me.setupComplete}
        onDone={async () => {
          setEditingCompany(false);
          await refresh();
        }}
        onCancel={me.setupComplete ? () => setEditingCompany(false) : undefined}
        onLogout={logout}
      />
    );

  return <Dashboard me={me} onEditCompany={() => setEditingCompany(true)} onLogout={logout} />;
}
