import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
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
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast: "!bg-surface-card !border !border-border-default !shadow-lg !text-on-surface !rounded-xl",
            title: "!text-on-surface !font-semibold !text-sm",
            description: "!text-on-surface-muted !text-xs",
            success: "!border-l-4 !border-l-primary-400",
            error: "!border-l-4 !border-l-danger-400",
            actionButton: "!bg-primary-50 dark:!bg-primary-950 !text-primary-600 dark:!text-primary-400 !border !border-primary-200 dark:!border-primary-800 !rounded-md !text-xs !font-medium !px-3 !py-1.5 !cursor-pointer hover:!bg-primary-100",
          },
        }}
      />
    </ErrorBoundary>
  );
}

export default App;
