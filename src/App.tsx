import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GlobalDialog } from "@/components/GlobalDialog";
import { Layout } from "@/components/Layout";
import { useThemeEffect } from "@/hooks/useThemeEffect";
import { DashboardPage } from "@/pages/DashboardPage";
import { PosPage } from "@/pages/PosPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { SalesPage } from "@/pages/SalesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import "./App.css";

function AppContent() {
  useThemeEffect();

  return (
    <MemoryRouter initialEntries={["/customers"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/customers" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pos" element={<PosPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/customers" replace />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <GlobalDialog />
    </ErrorBoundary>
  );
}

export default App;
