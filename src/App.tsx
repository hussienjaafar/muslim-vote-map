import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { RouteTracker } from "@/components/RouteTracker";
import { OrgProvider } from "@/contexts/OrgContext";
import { ImpersonationBanner } from "@/components/org/ImpersonationBanner";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Home from "./pages/Home.tsx";
import Signup from "./pages/Signup.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import NotFound from "./pages/NotFound.tsx";
import IssueDonorMap from "./pages/admin/IssueDonorMap.tsx";
import Account from "./pages/Account.tsx";
import FundraisingDashboard from "./pages/Dashboard.tsx";
import AdminLayout from "./pages/admin/AdminLayout.tsx";
import Dashboard from "./pages/admin/Dashboard.tsx";
import UsersLayout from "./pages/admin/UsersLayout.tsx";
import UsersList from "./pages/admin/users/UsersList.tsx";
import InvitesList from "./pages/admin/users/InvitesList.tsx";
import UserDetail from "./pages/admin/users/UserDetail.tsx";
import OrdersPage from "./pages/admin/Orders.tsx";
import OrderDetail from "./pages/admin/OrderDetail.tsx";
import ProductsPage from "./pages/admin/Products.tsx";
import DataManagement from "./pages/admin/DataManagement.tsx";
import LiveActivity from "./pages/admin/LiveActivity.tsx";
import Organizations from "./pages/admin/Organizations.tsx";
import OrganizationDetail from "./pages/admin/OrganizationDetail.tsx";
import RequestAccess from "./pages/RequestAccess.tsx";
import ApplicationStatus from "./pages/ApplicationStatus.tsx";
import ApplicationsList from "./pages/admin/users/ApplicationsList.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <RouteTracker />
        <OrgProvider>
        <ImpersonationBanner />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/request-access" element={<RequestAccess />} />
          <Route path="/application-status" element={<ApplicationStatus />} />

          {/* Auth-gated routes */}
          <Route path="/home" element={<AuthGuard><Home /></AuthGuard>} />
          <Route path="/map" element={<AuthGuard><IssueDonorMap /></AuthGuard>} />
          <Route path="/account" element={<AuthGuard><Account /></AuthGuard>} />
          <Route path="/dashboard" element={<AuthGuard><FundraisingDashboard /></AuthGuard>} />

          {/* Admin routes — sidebar layout */}
          <Route path="/admin" element={<AuthGuard requireAdmin><AdminLayout /></AuthGuard>}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<UsersLayout />}>
              <Route index element={<UsersList />} />
              <Route path="invites" element={<InvitesList />} />
              <Route path="applications" element={<ApplicationsList />} />
              <Route path=":userId" element={<UserDetail />} />
            </Route>
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetail />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="data" element={<DataManagement />} />
            <Route path="orgs" element={<Organizations />} />
            <Route path="orgs/:orgId" element={<OrganizationDetail />} />
            <Route path="issue-map" element={<IssueDonorMap isAdminView />} />
            <Route path="live" element={<LiveActivity />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </OrgProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
