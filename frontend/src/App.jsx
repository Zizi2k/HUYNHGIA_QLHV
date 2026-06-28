import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ClassesPage from './pages/ClassesPage';
import ClassDetailPage from './pages/ClassDetailPage';
import QuizPage from './pages/QuizPage';
import UsersPage from './pages/UsersPage';
import HonorPage from './pages/HonorPage';
import AttendancePage from './pages/AttendancePage';
import TuitionPage from './pages/TuitionPage';
import StudentsPage from './pages/StudentsPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<MainLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/classes/:id" element={<ClassDetailPage />} />
            <Route path="/quizzes/:id" element={<QuizPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/honor" element={<HonorPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/tuition" element={<TuitionPage />} />
            <Route path="/students" element={<StudentsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
