import { Toaster } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Welcome from "./pages/Welcome";
import Auth from "./pages/Auth";
import Me from "./pages/Me";
import Admin from "./pages/Admin";
import SitesManagement from "./pages/SitesManagement";
import UsersManagement from "./pages/UsersManagement";
import Reports from "./pages/Reports";
import WhoIsOnShift from "./pages/WhoIsOnShift";
import WorkerDetails from "./pages/WorkerDetails";
import MyShifts from "./pages/MyShifts";
import Settings from "./pages/Settings";
import Register from "./pages/Register";
import Billing from "./pages/Billing";
import TelegramSettings from "./pages/TelegramSettings";
import ApiKeys from "./pages/ApiKeys";
import SuperAdmin from "./pages/SuperAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Welcome />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/register" element={<Register />} />

          {/* Worker */}
          <Route path="/me" element={
            <ProtectedRoute>
              <Me />
            </ProtectedRoute>
          } />
          <Route path="/me/shifts" element={
            <ProtectedRoute>
              <MyShifts />
            </ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin>
              <Admin />
            </ProtectedRoute>
          } />
          <Route path="/admin/sites" element={
            <ProtectedRoute requireAdmin>
              <SitesManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute requireAdmin>
              <UsersManagement />
            </ProtectedRoute>
          } />
          <Route path="/admin/reports" element={
            <ProtectedRoute requireAdmin>
              <Reports />
            </ProtectedRoute>
          } />
          <Route path="/admin/on-shift" element={
            <ProtectedRoute requireAdmin>
              <WhoIsOnShift />
            </ProtectedRoute>
          } />
          <Route path="/admin/workers/:id" element={
            <ProtectedRoute requireAdmin>
              <WorkerDetails />
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute requireAdmin>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="/admin/billing" element={
            <ProtectedRoute requireAdmin>
              <Billing />
            </ProtectedRoute>
          } />
          <Route path="/admin/telegram" element={
            <ProtectedRoute requireAdmin>
              <TelegramSettings />
            </ProtectedRoute>
          } />
          <Route path="/admin/api-keys" element={
            <ProtectedRoute requireAdmin>
              <ApiKeys />
            </ProtectedRoute>
          } />

          {/* Platform super-admin (password protected inside the page) */}
          <Route path="/super" element={<SuperAdmin />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
