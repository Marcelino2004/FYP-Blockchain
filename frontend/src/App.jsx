import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Web3Provider } from './context/Web3Context';
import Navigation from './components/Navigation';
import { CONTRACT_ADDRESSES, API_BASE_URL } from './utils/constants';

// Import all pages
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import MyLoansPage from './pages/MyLoansPage';
import ReputationPage from './pages/ReputationPage';
import CoSigningPage from './pages/CoSigningPage';

console.log('🔧 CONTRACT_ADDRESSES from constants.js:', JSON.stringify(CONTRACT_ADDRESSES, null, 2));
console.log('🔧 Environment variables:', JSON.stringify({
  VITE_LENDING_POOL_LENS: import.meta.env.VITE_LENDING_POOL_LENS,
  VITE_LENDING_POOL: import.meta.env.VITE_LENDING_POOL,
  VITE_REPUTATION_MANAGER: import.meta.env.VITE_REPUTATION_MANAGER,
}, null, 2));

// Footer Component
const Footer = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            © RepChain - Decentralized Lending Platform
          </p>
        </div>
      </div>
    </footer>
  );
};

console.log('🔧 CONTRACT_ADDRESSES:', CONTRACT_ADDRESSES);
console.log('🔧 API_BASE_URL:', API_BASE_URL);

// Main App Content
function AppContent() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-red-500 text-white p-4">

      </div>
      <Navigation />
      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/marketplace" element={<MarketplacePage />} />
          <Route path="/my-loans" element={<MyLoansPage />} />
          <Route path="/reputation" element={<ReputationPage />} />
          <Route path="/cosigning" element={<CoSigningPage />} />
        </Routes>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// Root App with Providers
export default function App() {
  return (
    <Router>
      <Web3Provider>
        <AppContent />
      </Web3Provider>
    </Router>
  );
}