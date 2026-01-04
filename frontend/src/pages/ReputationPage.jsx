import React from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useReputation } from '../hooks';
import { 
  Card, 
  LoadingSpinner, 
  Alert,
  ReputationBadge,
  Badge,
  EmptyState
} from '../components';
import { formatCurrency, formatDate, formatTimeAgo } from '../utils/formatters';

const ReputationPage = () => {
  const { account } = useWeb3();
  const { reputation, loading } = useReputation(account);

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          Please connect your wallet to view your reputation
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!reputation) {
    return (
      <EmptyState 
        title="No reputation data"
        description="Complete your first transaction to start building your reputation"
      />
    );
  }

  const data = reputation.data;
  const score = reputation.score;

  // Calculate percentages and metrics
  const totalLoans = parseInt(data.successfulRepayments || 0) + parseInt(data.defaults || 0);
  const successRate = totalLoans > 0 
    ? ((data.successfulRepayments / totalLoans) * 100).toFixed(1) 
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reputation Profile</h1>
        <p className="text-gray-600">Your on-chain credit score and transaction history</p>
      </div>

      {/* Main Score Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="text-center py-8">
          <ReputationBadge score={score} size="lg" />
          <p className="text-gray-600 mt-4 max-w-2xl mx-auto">
            Your reputation score is calculated based on your transaction history, 
            repayment behavior, and overall platform activity.
          </p>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatBox
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${data.successfulRepayments} of ${totalLoans} loans`}
          color="green"
        />
        <StatBox
          title="Total Transactions"
          value={data.totalTransactions?.toString() || '0'}
          subtitle="On-chain transactions"
          color="blue"
        />
        <StatBox
          title="Unique Counterparties"
          value={data.uniqueCounterparties?.toString() || '0'}
          subtitle="Trading partners"
          color="purple"
        />
        <StatBox
          title="Default Rate"
          value={totalLoans > 0 ? `${((data.defaults / totalLoans) * 100).toFixed(1)}%` : '0%'}
          subtitle={`${data.defaults} defaults`}
          color={data.defaults > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repayment History */}
        <Card>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Repayment History
          </h2>
          
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Successful Repayments</span>
                <span className="text-2xl font-bold text-green-600">
                  {data.successfulRepayments}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                Total Value: {formatCurrency(data.totalRepaymentValue || 0, 4)} ETH
              </div>
            </div>

            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Defaults</span>
                <span className="text-2xl font-bold text-red-600">
                  {data.defaults}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                Total Value: {formatCurrency(data.totalDefaultValue || 0, 4)} ETH
              </div>
            </div>

            {/* Success Rate Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Overall Success Rate</span>
                <span className="font-semibold">{successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Activity Metrics */}
        <Card>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Activity Metrics
          </h2>
          
          <div className="space-y-3">
            <MetricRow 
              label="Total Transactions"
              value={data.totalTransactions?.toString() || '0'}
            />
            <MetricRow 
              label="Unique Counterparties"
              value={data.uniqueCounterparties?.toString() || '0'}
            />
            <MetricRow 
              label="Total Value Transferred"
              value={`${formatCurrency(data.totalValueTransferred || 0, 4)} ETH`}
            />
            <MetricRow 
              label="Wallet Creation"
              value={formatDate(data.walletCreationTime)}
            />
            <MetricRow 
              label="Last Activity"
              value={formatTimeAgo(data.lastActivityTimestamp)}
            />
          </div>
        </Card>
      </div>

      {/* Verification Status */}
      <Card>
        <h2 className="text-xl font-semibold mb-4">Verification Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">Email Verification</span>
            </div>
            {data.emailVerified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Not Verified</Badge>
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">Phone Verification</span>
            </div>
            {data.phoneVerified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Not Verified</Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Co-signing Bonus */}
      {data.coSigningBonus > 0 && (
        <Card className="bg-purple-50 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Co-signing Bonus
              </h3>
              <p className="text-sm text-gray-600">
                You've earned additional reputation through co-signing relationships
              </p>
            </div>
            <div className="text-3xl font-bold text-purple-600">
              +{data.coSigningBonus}
            </div>
          </div>
        </Card>
      )}

      {/* How to Improve */}
      <Card className="bg-blue-50">
        <h2 className="text-xl font-semibold mb-4">How to Improve Your Reputation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TipCard 
            icon="✅"
            title="Complete Repayments On Time"
            description="Timely loan repayments are the fastest way to boost your score"
          />
          <TipCard 
            icon="🤝"
            title="Engage with Co-signers"
            description="Build trust relationships through co-signing to gain bonus points"
          />
          <TipCard 
            icon="📧"
            title="Verify Your Identity"
            description="Email and phone verification add credibility to your profile"
          />
          <TipCard 
            icon="💼"
            title="Increase Transaction Volume"
            description="More successful transactions demonstrate reliability"
          />
        </div>
      </Card>
    </div>
  );
};

// Helper Components
const StatBox = ({ title, value, subtitle, color }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Card className={`${colors[color]} border-2 text-center`}>
      <p className="text-sm font-medium mb-2">{title}</p>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-xs opacity-75">{subtitle}</p>
    </Card>
  );
};

const MetricRow = ({ label, value }) => (
  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
    <span className="text-sm text-gray-600">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

const TipCard = ({ icon, title, description }) => (
  <div className="flex gap-3 p-4 bg-white rounded-lg">
    <div className="text-2xl">{icon}</div>
    <div>
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

export default ReputationPage;