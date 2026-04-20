import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import AnalyticsPage from './pages/AnalyticsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import LogsPage from './pages/LogsPage';
import ReviewDetailPage from './pages/ReviewDetailPage';
import ReviewsPage from './pages/ReviewsPage';
import { useIsAdmin, useSession } from './lib/auth';

function ProtectedRoute({ children }) {
  const session = useSession();
  if (session === undefined) return null;
  return session ? children : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }) {
  const session = useSession();
  if (session === undefined) return null;
  return session ? <Navigate to="/dashboard" replace /> : children;
}

function AdminRoute({ children }) {
  const session = useSession();
  const isAdmin = useIsAdmin();
  if (session === undefined) return null;
  return session && isAdmin ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:id" element={<ReviewDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route
          path="/logs"
          element={
            <AdminRoute>
              <LogsPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
