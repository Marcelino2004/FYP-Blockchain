import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useWeb3 } from '../context/Web3Context';
import { useReputation, useLoans } from '../hooks';
import { 
  Card, 
  StatCard, 
  LoadingSpinner, 
  Alert, 
  ReputationBadge,
  Badge,
  Button,
  EmptyState 
} from '../components';
import { formatCurrency, formatTimeAgo, formatPercentage } from '../utils/formatters';
import { LOAN_STATUS_LABELS } from '../utils/constants';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { account } = useWeb3();
  const { reputation, loading: repLoading } = useReputation(account);
  const { loans, loading: loansLoading } = useLoans(account);

  // Calculate stats from loans
  const activeLoans = loans.filter(l => l.status === 'ACTIVE');
  const totalBorrowed = loans
    .filter(l => l.borrower === account && l.status === 'ACTIVE')
    .reduce((sum, l) => sum + parseFloat(l.terms.principalAmount || 0), 0);
  const totalLent = loans
    .filter(l => l.lender === account && l.status === 'ACTIVE')
    .reduce((sum, l) => sum + parseFloat(l.terms.principalAmount || 0), 0);

  // Recent activity (mock for now)
  const recentActivity = [
    {
      id: 1,
      type: 'repayment',
      description: 'Loan repayment received',
      amount: '2.5 ETH',
      timestamp: Date.now() - 3600000,
      status: 'success'
    },
    {
      id: 2,
      type: 'loan_created',
      description: 'New loan offer created',
      amount: '5.0 ETH',
      timestamp: Date.now() - 86400000,
      status: 'info'
    }
  ];

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          <div className="flex items-center justify-between">
            <span>Please connect your wallet to view your dashboard</span>
            <Button variant="primary" onClick={() => {}}>
              Connect Wallet
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your lending overview.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/marketplace')}>
          Create New Offer
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Reputation Score" 
          value={repLoading ? '...' : reputation?.score || '0'}
          loading={repLoading}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          }
        />
        <StatCard 
          title="Active Loans" 
          value={loansLoading ? '...' : activeLoans.length.toString()}
          loading={loansLoading}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard 
          title="Total Borrowed" 
          value={formatCurrency(totalBorrowed, 4) + ' ETH'}
          loading={loansLoading}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard 
          title="Total Lent" 
          value={formatCurrency(totalLent, 4) + ' ETH'}
          loading={loansLoading}
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Reputation Details */}
        <Card>
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-xl font-semibold">Your Reputation</h2>
            <Button variant="outline" onClick={() => navigate('/reputation')}>
              View Details
            </Button>
          </div>
          
          {repLoading ? (
            <LoadingSpinner />
          ) : reputation ? (
            <div className="space-y-4">
              <ReputationBadge score={reputation.score} size="lg" />
              
              <div className="space-y-3 mt-6">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Successful Repayments</span>
                  <span className="font-semibold">{reputation.data?.successfulRepayments || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Defaults</span>
                  <span className="font-semibold text-red-600">{reputation.data?.defaults || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Total Transactions</span>
                  <span className="font-semibold">{reputation.data?.totalTransactions || 0}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-600">Total Value Repaid</span>
                  <span className="font-semibold">
                    {formatCurrency(reputation.data?.totalRepaymentValue || 0, 4)} ETH
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState 
              title="No reputation data"
              description="Complete your first transaction to build your reputation"
            />
          )}
        </Card>

        {/* Recent Activity */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => (
                <div 
                  key={activity.id} 
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    activity.status === 'success' ? 'bg-green-500' : 'bg-blue-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500">{formatTimeAgo(activity.timestamp)}</p>
                  </div>
                  <Badge variant={activity.status === 'success' ? 'success' : 'info'}>
                    {activity.amount}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState 
                title="No recent activity"
                description="Your recent transactions will appear here"
              />
            )}
          </div>
        </Card>
      </div>

      {/* Active Loans Table */}
      <Card>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Active Loans</h2>
          <Button variant="outline" onClick={() => navigate('/my-loans')}>
            View All
          </Button>
        </div>

        {loansLoading ? (
          <LoadingSpinner />
        ) : activeLoans.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Loan ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Interest
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activeLoans.slice(0, 5).map((loan) => (
                  <tr key={loan.loanId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{loan.loanId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {loan.borrower === account ? 'Borrower' : 'Lender'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {loan.terms.principalAmount} ETH
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {loan.terms.interestRate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatTimeAgo(loan.dueTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info">{LOAN_STATUS_LABELS[1]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState 
            title="No active loans"
            description="You don't have any active loans. Browse the marketplace to get started."
            action={
              <Button variant="primary" onClick={() => navigate('/marketplace')}>
                Browse Marketplace
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
};

export default DashboardPage;