import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ResumeProvider } from './contexts/ResumeContext';
import Dashboard from './components/Dashboard';
import EmployeePortal from './components/EmployeePortal';
import PMPortal from './components/PMPortal';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import './App.css';

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}

// Main App Content with Routing
function AppContent() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Login />
        } 
      />
      <Route 
        path="/register" 
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Register />
        } 
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            {user?.role === 'EMPLOYEE' ? (
              <EmployeePortal />
            ) : user?.role === 'HR' ? (
              <Dashboard />
            ) : user?.role === 'PROJECT_MANAGER' ? (
              <PMPortal />
            ) : (
              <EmployeePortal />
            )}
          </ProtectedRoute>
        }
      />

      {/* Catch all - redirect to home or login */}
      <Route 
        path="*" 
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <Navigate to="/login" replace />
        } 
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ResumeProvider>
          <div className="App">
            <AppContent />
          </div>
        </ResumeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App
