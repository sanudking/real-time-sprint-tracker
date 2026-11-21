import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { RealtimeProvider } from './context/RealtimeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AuthPage from './pages/AuthPage';
import WorkspacesPage from './pages/WorkspacesPage';
import BoardPage from './pages/BoardPage';
import MyWorkPage from './pages/MyWorkPage';
export default function App() {
  return <AuthProvider><RealtimeProvider><BrowserRouter><Routes>
    <Route path="/login" element={<AuthPage mode="login"/>}/><Route path="/register" element={<AuthPage mode="register"/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route path="/workspaces" element={<WorkspacesPage/>}/>
      <Route path="/my-work" element={<MyWorkPage/>}/>
      <Route path="/workspace/:id" element={<BoardPage/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/workspaces" replace/>}/>
  </Routes></BrowserRouter></RealtimeProvider></AuthProvider>;
}
