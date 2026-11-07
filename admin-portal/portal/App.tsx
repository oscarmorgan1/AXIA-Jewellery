import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAccount } from './account';
import Logo from '../src/components/Logo';
import Login from './pages/Login';
import Claim from './pages/Claim';
import Reset from './pages/Reset';
import { AddressPage, DetailsPage, EmailsPage, SecurityPage } from './pages/Account';
import Bag from './pages/Bag';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Pieces from './pages/Pieces';
import Layout from './Layout';

function Loading() {
  return <div className="loading-screen"><Logo height={22} className="logo--loading" /></div>;
}

export default function App() {
  const { user, loading, error, logout } = useAccount();
  const loc = useLocation();

  // These work signed in or out: they come from an email link.
  if (loc.pathname.startsWith('/claim')) return <Claim />;
  if (loc.pathname.startsWith('/reset')) return <Reset />;

  if (loading) return <Loading />;
  if (!user) return <Login />;
  if (error) {
    return (
      <div className="loading-screen">
        <div className="card empty" style={{ maxWidth: 420 }}>
          <b>We couldn’t open your account</b>
          <p>{error}</p>
          <button className="btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/pieces" element={<Pieces />} />
        <Route path="/bag" element={<Bag />} />
        <Route path="/details" element={<DetailsPage />} />
        <Route path="/address" element={<AddressPage />} />
        <Route path="/emails" element={<EmailsPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
    </Layout>
  );
}
