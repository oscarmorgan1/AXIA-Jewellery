import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Logo from './components/Logo';
import Login from './pages/Login';
import NotAuthorised from './pages/NotAuthorised';
import SignInCode from './pages/SignInCode';

// Each page loads when it's first opened, so the portal starts faster.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const ProductEdit = lazy(() => import('./pages/ProductEdit'));
const Margins = lazy(() => import('./pages/Margins'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Promos = lazy(() => import('./pages/Promos'));
const Settings = lazy(() => import('./pages/Settings'));
const Collections = lazy(() => import('./pages/Collections'));
const Customers = lazy(() => import('./pages/Customers'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const InboxPage = lazy(() => import('./pages/Inbox'));
const Website = lazy(() => import('./pages/Website'));
const Pieces = lazy(() => import('./pages/Pieces'));
const Suppliers = lazy(() => import('./pages/Suppliers'));

export default function App() {
  const { user, isAdmin, verified, loading } = useAuth();
  if (loading) return <div className="loading-screen"><Logo height={34} className="logo--loading" /></div>;
  if (!user) return <Login />;
  if (!isAdmin) return <NotAuthorised />;
  if (!verified) return <SignInCode />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductEdit />} />
        <Route path="products/:id" element={<ProductEdit />} />
        <Route path="collections" element={<Collections />} />
        <Route path="pieces" element={<Pieces />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="margins" element={<Margins />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="promos" element={<Promos />} />
        <Route path="website" element={<Website />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
