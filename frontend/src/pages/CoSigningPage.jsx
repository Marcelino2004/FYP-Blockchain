import React, { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useCoSigning } from '../hooks';
import { 
  Card, 
  Button, 
  Badge, 
  LoadingSpinner, 
  EmptyState,
  Modal,
  Alert,
  AddressDisplay
} from '../components';
import { formatTimeAgo } from '../utils/formatters';

const CoSigningPage = () => {
  const { account } = useWeb3();
  const { coSignings, requests, stats, loading } = useCoSigning(account);
  const [activeTab, setActiveTab] = useState('requests'); // requests, myCoSignings
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);

  const handleAcceptRequest = (request) => {
    setSelectedRequest(request);
    setAcceptModalOpen(true);
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          Please connect your wallet to view co-signing opportunities
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Co-signing</h1>
        <p className="text-gray-600">
          Help borrowers by vouching for them and earn reputation bonuses
        </p>
      </div>

      {/* Info Banner */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
        <div className="flex items-start gap-4">
          <svg className="h-8 w-8 text-purple-600 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-lg mb-2">What is Co-signing?</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Co-signing allows trusted users to stake their reputation to help borrowers access better loan terms. 
              As a co-signer, you earn reputation bonuses when the borrower repays successfully. However, 
              if they default, you'll face a reputation penalty. Choose wisely!
            </p>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="text-center">
            <p className="text-sm text-gray-600 mb-2">Total Co-signings</p>
            <p className="text-3xl font-bold text-gray-900">{stats.totalCoSignings}</p>
          </Card>
          <Card className="text-center">
            <p className="text-sm text-gray-600 mb-2">Active</p>
            <p className="text-3xl font-bold text-blue-600">{stats.activeCoSignings}</p>
          </Card>
          <Card className="text-center">
            <p className="text-sm text-gray-600 mb-2">Successful</p>
            <p className="text-3xl font-bold text-green-600">{stats.successfulCoSignings}</p>
          </Card>
          <Card className="text-center">
            <p className="text-sm text-gray-600 mb-2">Defaulted</p>
            <p className="text-3xl font-bold text-red-600">{stats.defaultedCoSignings}</p>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'requests'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Open Requests
          <Badge variant="info" className="ml-2">{requests.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab('myCoSignings')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'myCoSignings'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          My Co-signings
          <Badge variant="success" className="ml-2">{coSignings.length}</Badge>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : activeTab === 'requests' ? (
        <RequestsList requests={requests} onAccept={handleAcceptRequest} />
      ) : (
        <CoSigningsList coSignings={coSignings} />
      )}

      {/* Accept Request Modal */}
      <AcceptCoSignModal 
        isOpen={acceptModalOpen}
        onClose={() => setAcceptModalOpen(false)}
        request={selectedRequest}
        onSuccess={() => {
          setAcceptModalOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
};

// Requests List Component
const RequestsList = ({ requests, onAccept }) => {
  if (requests.length === 0) {
    return (
      <EmptyState 
        title="No open requests"
        description="There are no co-signing requests available at the moment. Check back later!"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {requests.map((request) => (
        <Card key={request.requestId} hover>
          <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">Co-signing Request</h3>
                <p className="text-sm text-gray-500">
                  {formatTimeAgo(request.createdAt)}
                </p>
              </div>
              <Badge variant="info">Open</Badge>
            </div>

            {/* Details */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Borrower</span>
                <AddressDisplay address={request.borrower} shortened={true} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Loan Offer ID</span>
                <span className="font-mono">#{request.loanOfferId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Requested Bonus</span>
                <span className="font-semibold text-purple-600">
                  +{request.requestedBonus} Rep
                </span>
              </div>
            </div>

            {/* Message */}
            {request.message && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Message from borrower:</p>
                <p className="text-sm text-gray-700">{request.message}</p>
              </div>
            )}

            {/* Action */}
            <Button 
              variant="primary" 
              onClick={() => onAccept(request)}
              className="w-full"
            >
              Accept & Co-sign
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
};

// Co-signings List Component
const CoSigningsList = ({ coSignings }) => {
  if (coSignings.length === 0) {
    return (
      <EmptyState 
        title="No co-signings yet"
        description="You haven't co-signed any loans. Browse open requests to get started and earn reputation bonuses."
      />
    );
  }

  return (
    <div className="space-y-4">
      {coSignings.map((coSigning) => (
        <Card key={coSigning.recordId}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-semibold">Co-signing #{coSigning.recordId}</h3>
                {coSigning.isActive && <Badge variant="info">Active</Badge>}
                {coSigning.loanCompleted && !coSigning.borrowerDefaulted && (
                  <Badge variant="success">Completed</Badge>
                )}
                {coSigning.borrowerDefaulted && (
                  <Badge variant="danger">Defaulted</Badge>
                )}
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Borrower</p>
                  <AddressDisplay address={coSigning.borrower} shortened={true} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Loan ID</p>
                  <p className="font-mono text-sm">#{coSigning.loanId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Rep Staked</p>
                  <p className="font-semibold">{coSigning.reputationStaked}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Bonus Provided</p>
                  <p className="font-semibold text-purple-600">
                    +{coSigning.bonusProvided}
                  </p>
                </div>
              </div>

              {/* Status Info */}
              <div className="text-sm text-gray-600">
                Co-signed {formatTimeAgo(coSigning.coSignTimestamp)}
              </div>

              {/* Warning for defaulted */}
              {coSigning.borrowerDefaulted && (
                <Alert variant="error">
                  This borrower defaulted. You've incurred a reputation penalty.
                </Alert>
              )}
            </div>

            {/* Action or Status Indicator */}
            <div className="flex flex-col items-center gap-2">
              {coSigning.isActive && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-3 h-3 bg-blue-600 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Loan Active</span>
                </div>
              )}
              {coSigning.loanCompleted && !coSigning.borrowerDefaulted && (
                <div className="flex items-center gap-2 text-green-600">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium">Earned Bonus</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

// Accept Co-sign Modal
const AcceptCoSignModal = ({ isOpen, onClose, request, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!request) return null;

  const handleAccept = async () => {
    setLoading(true);
    setError('');

    try {
      // TODO: Implement actual contract call
      // const tx = await contracts.coSigningManager.acceptCoSigningRequest(request.requestId);
      // await tx.wait();
      
      // Simulate success
      setTimeout(() => {
        onSuccess();
        setLoading(false);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to accept co-signing request');
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Accept Co-signing Request" size="md">
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="warning">
          <div className="space-y-2">
            <p className="font-semibold">⚠️ Important Warning</p>
            <p className="text-sm">
              By co-signing, you're staking your reputation. If the borrower defaults, 
              you'll face a reputation penalty. Only co-sign for people you trust.
            </p>
          </div>
        </Alert>

        <Card className="bg-blue-50">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Request ID</span>
              <span className="font-semibold">#{request.requestId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Borrower</span>
              <AddressDisplay address={request.borrower} shortened={true} />
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Loan Offer</span>
              <span className="font-mono">#{request.loanOfferId}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-sm font-medium">Reputation Bonus</span>
              <span className="text-lg font-bold text-purple-600">
                +{request.requestedBonus}
              </span>
            </div>
          </div>
        </Card>

        {request.message && (
          <Card className="bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">Message from borrower:</p>
            <p className="text-sm">{request.message}</p>
          </Card>
        )}

        <div className="flex gap-4 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            variant="primary" 
            loading={loading} 
            onClick={handleAccept}
            className="flex-1"
          >
            Accept & Co-sign
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CoSigningPage;