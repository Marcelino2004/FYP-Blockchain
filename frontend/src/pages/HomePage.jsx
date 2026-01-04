import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { Button, Card, StatCard } from '../components';
import { usePlatformStats } from '../hooks';

const HomePage = () => {
  const navigate = useNavigate();
  const { account, connectWallet } = useWeb3();
  const { stats, loading } = usePlatformStats();

  const features = [
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
      title: 'Secure & Trustless',
      description: 'Smart contracts ensure transparent, automated lending with no intermediaries. Your funds are always protected by blockchain security.'
    },
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      ),
      title: 'Reputation-Based',
      description: 'Build your on-chain credit score through successful loans. Higher reputation unlocks better rates and larger loan amounts.'
    },
    {
      icon: (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      title: 'Competitive Rates',
      description: 'Get better rates than traditional lending with no middlemen. Peer-to-peer lending means more value for borrowers and lenders.'
    }
  ];

  const howItWorks = [
    {
      step: '1',
      title: 'Connect Wallet',
      description: 'Connect your MetaMask or other Web3 wallet to get started'
    },
    {
      step: '2',
      title: 'Build Reputation',
      description: 'Complete transactions and repay loans to increase your score'
    },
    {
      step: '3',
      title: 'Borrow or Lend',
      description: 'Create offers or accept existing ones in the marketplace'
    },
    {
      step: '4',
      title: 'Earn Returns',
      description: 'Earn competitive interest rates on your crypto assets'
    }
  ];

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="text-center py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Welcome to <span className="text-blue-600">RepChain</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
            Decentralized peer-to-peer lending powered by blockchain reputation. 
            Borrow without traditional credit checks, lend with confidence.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {account ? (
              <>
                <Button 
                  variant="primary" 
                  onClick={() => navigate('/marketplace')}
                  className="w-full sm:w-auto"
                >
                  Explore Marketplace
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => navigate('/dashboard')}
                  className="w-full sm:w-auto"
                >
                  View Dashboard
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="primary" 
                  onClick={connectWallet}
                  className="w-full sm:w-auto"
                >
                  Get Started
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/marketplace')}
                  className="w-full sm:w-auto"
                >
                  Learn More
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Platform Stats */}
      {!loading && stats && (
        <section className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Total Loans" 
              value={stats.totalLoans || '0'}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            />
            <StatCard 
              title="Active Offers" 
              value={(stats.activeLenderOffers + stats.activeBorrowerRequests) || '0'}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              }
            />
            <StatCard 
              title="Lender Offers" 
              value={stats.activeLenderOffers || '0'}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard 
              title="Borrow Requests" 
              value={stats.activeBorrowerRequests || '0'}
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            />
          </div>
        </section>
      )}

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          Why Choose RepChain?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} hover className="text-center">
              <div className="flex justify-center mb-4 text-blue-600">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {howItWorks.map((item, index) => (
              <div key={index} className="relative">
                <div className="bg-white rounded-xl p-6 shadow-md h-full">
                  <div className="flex items-center justify-center w-12 h-12 bg-blue-600 text-white rounded-full text-xl font-bold mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm">{item.description}</p>
                </div>
                {index < howItWorks.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <svg className="h-8 w-8 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 text-center py-16">
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl mb-8 text-blue-100">
            Join thousands of users already using LendChain for their crypto lending needs
          </p>
          {account ? (
            <Button 
              variant="secondary" 
              onClick={() => navigate('/marketplace')}
              className="bg-white text-blue-600 hover:bg-gray-100"
            >
              Browse Marketplace
            </Button>
          ) : (
            <Button 
              variant="secondary"
              onClick={connectWallet}
              className="bg-white text-blue-600 hover:bg-gray-100"
            >
              Connect Wallet to Start
            </Button>
          )}
        </Card>
      </section>
    </div>
  );
};

export default HomePage;