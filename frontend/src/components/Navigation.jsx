import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { formatAddress } from '../utils/formatters';

const Navigation = () => {
  const { account, connectWallet, disconnectWallet, isConnecting } = useWeb3();
  const location = useLocation();

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Marketplace', path: '/marketplace' },
    { name: 'My Loans', path: '/my-loans' },
    { name: 'Reputation', path: '/reputation' },
    { name: 'Co-signing', path: '/cosigning' },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Top Row: Logo and Wallet */}
        <div className="flex justify-between items-center mb-4">
          {/* Logo */}
          <Link to="/" className="text-2xl font-bold text-blue-600">
            RepChain
          </Link>

          {/* Wallet Button */}
          <div>
            {account ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono bg-gray-100 px-3 py-2 rounded-lg">
                  {formatAddress(account)}
                </span>
                <button
                  onClick={disconnectWallet}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-wrap gap-2">
        {navLinks.map((link) => (
            <Link
            key={link.path}
            to={link.path}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${
                isActive(link.path)
                    ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
            `}
            >
            {link.icon}
            <span>{link.name}</span>
            </Link>
        ))}
        </div>

      </div>
    </nav>
  );
};

export default Navigation;