import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import NotAuthorised from './pages/NotAuthorised';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import ProductEdit from './pages/ProductEdit';
import Margins from './pages/Margins';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import Collections from './pages/Collections';
import Customers from './pages/Customers';
import InboxPage from './pages/Inbox';
import Website from './pages/Website';

export default function App() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="loading-screen"><span className="brand__mark">A</span></div>;
  if (!user) return <Login />;
  if (!isAdmin) return <NotAuthorised />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductEdit />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="collections" element={<Collections />} />
        <Route path="customers" element={<Customers />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="margins" element={<Margins />} />
        <Route path="orders" element={<Orders />} />
        <Route path="website" element={<Website />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
