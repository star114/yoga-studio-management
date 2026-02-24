import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import CustomerDashboard from './pages/CustomerDashboard';
import CustomerMemberships from './pages/CustomerMemberships';
import CustomerClassDetail from './pages/CustomerClassDetail';
import CustomerManagement from './pages/CustomerManagement';
import CustomerDetail from './pages/CustomerDetail';
import CustomerAttendances from './pages/CustomerAttendances';
import CustomerProfile from './pages/CustomerProfile';
import MembershipTypeManagement from './pages/MembershipTypeManagement';
import ClassManagement from './pages/ClassManagement';
import ClassHistory from './pages/ClassHistory';
import ClassDetail from './pages/ClassDetail';
import Layout from './components/Layout';

const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ 
  children, 
  adminOnly = false 
}) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-warm-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={
          user?.role === 'admin' 
            ? <AdminDashboard /> 
            : <CustomerDashboard />
        } />
        <Route path="customers" element={
          <ProtectedRoute adminOnly>
            <CustomerManagement />
          </ProtectedRoute>
        } />
        <Route path="customers/:id" element={
          <ProtectedRoute adminOnly>
            <CustomerDetail />
          </ProtectedRoute>
        } />
        <Route path="customers/:id/attendances" element={
          <ProtectedRoute adminOnly>
            <CustomerAttendances />
          </ProtectedRoute>
        } />
        <Route path="memberships" element={
          user?.role === 'admin'
            ? <Navigate to="/customers" replace />
            : <CustomerMemberships />
        } />
        <Route path="profile" element={
          <ProtectedRoute>
            <CustomerProfile />
          </ProtectedRoute>
        } />
        <Route path="membership-types" element={
          <ProtectedRoute adminOnly>
            <MembershipTypeManagement />
          </ProtectedRoute>
        } />
        <Route path="classes" element={
          <ProtectedRoute adminOnly>
            <ClassManagement />
          </ProtectedRoute>
        } />
        <Route path="classes/history" element={
          <ProtectedRoute adminOnly>
            <ClassHistory />
          </ProtectedRoute>
        } />
        <Route path="classes/:id" element={
          <ProtectedRoute>
            {user?.role === 'admin' ? <ClassDetail /> : <CustomerClassDetail />}
          </ProtectedRoute>
        } />
        {/* 추가 라우트들은 여기에 추가 */}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
