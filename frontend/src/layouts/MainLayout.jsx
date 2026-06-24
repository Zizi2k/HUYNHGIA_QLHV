import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner, Container } from 'react-bootstrap';
import Navbar from '../components/Navbar';

export default function MainLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <Navbar />
      <main className="py-4">
        <Outlet />
      </main>
    </>
  );
}
