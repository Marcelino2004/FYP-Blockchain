import React, { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useLoans } from '../hooks';
import { 
  Card, 
  Button, 
  Badge, 
  LoadingSpinner, 
  EmptyState,
  Modal,
  Input,
  Alert,
  AddressDisplay
} from '../components';
import { formatCurrency, formatTimeAgo, formatDate, isDatePast } from '../utils/formatters';
import { LOAN_STATUS_LABELS } from '../utils/constants';

const MyLoansPage = () => {
  const { account } = useWeb3();
  const { loans, loading, refetch } = useLoans(account);
  const [activeTab, setActiveTab] = useState('all'); // all, borrowed, lent
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [repayModalOpen, setRepayModalOpen] = useState(false);

  // Filter loans based on active tab
  const getFilteredLoans = () => {
    if (activeTab === 'borrowed') return loans.filter(l => l.borrower === account);
    if (activeTab === 'lent') return loans.filter(l => l.lender === account);
    return loans;
  };

  const filteredLoans = getFilteredLoans();
  const borrowedLoans = loans.filter(l => l.borrower === account);
  const lentLoans = loans.filter(l => l.lender === account);

  const handleRepay = (loan) => {
    setSelectedLoan(loan);
    setRepayModalOpen(true);
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          Please connect your wallet to view your loans
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Loans</h1>
        <p className="text-gray-600">Manage your active and completed loans</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Total Loans</p>
            <p className="text-3xl font-bold text-gray-900">{loans.length}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">As Borrower</p>
            <p className="text-3xl font-bold text-blue-600">{borrowedLoans.length}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">As Lender</p>
            <p className="text-3xl font-bold text-green-600">{lentLoans.length}</p>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'all'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All Loans
          <Badge variant="default" className="ml-2">{loans.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab('borrowed')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'borrowed'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Borrowed
          <Badge variant="info" className="ml-2">{borrowedLoans.length}</Badge>
        </button>
        <button
          onClick={() => setActiveTab('lent')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'lent'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Lent
          <Badge variant="success" className="ml-2">{lentLoans.length}</Badge>
        </button>
      </div>

      {/* Loans List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredLoans.length > 0 ? (
        <div className="space-y-4">
          {filteredLoans.map((loan) => (
            <LoanCard 
              key={loan.loanId} 
              loan={loan}
              currentAccount={account}
              onRepay={handleRepay}
            />
          ))}
        </div>
      ) : (
        <EmptyState 
          title="No loans found"
          description="You don't have any loans yet. Visit the marketplace to create or accept loan offers."
          action={
            <Button variant="primary" onClick={() => window.location.href = '/marketplace'}>
              Browse Marketplace
            </Button>
          }
        />
      )}

      {/* Repay Modal */}
      <RepayLoanModal 
        isOpen={repayModalOpen}
        onClose={() => setRepayModalOpen(false)}
        loan={selectedLoan}
        onSuccess={() => {
          setRepayModalOpen(false);
          refetch();
        }}
      />
    </div>
  );
};

// Loan Card Component
const LoanCard = ({ loan, currentAccount, onRepay }) => {
  const isBorrower = loan.borrower === currentAccount;
  const isOverdue = loan.status === 'ACTIVE' && loan.isOverdue;
  
  const getStatusBadge = () => {
    const status = loan.status;
    if (status === 'ACTIVE' && isOverdue) {
      return <Badge variant="danger">Overdue</Badge>;
    }
    
    const variants = {
      'PENDING': 'warning',
      'ACTIVE': 'info',
      'REPAID': 'success',
      'DEFAULTED': 'danger',
      'CANCELLED': 'default'
    };
    
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <Card hover>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex-1 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-semibold">Loan #{loan.loanId}</h3>
            {getStatusBadge()}
            <Badge variant={isBorrower ? 'info' : 'success'}>
              {isBorrower ? 'Borrower' : 'Lender'}
            </Badge>
          </div>

          {/* Loan Details Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Principal</p>
              <p className="font-semibold">{loan.terms.principalAmount} ETH</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Interest Rate</p>
              <p className="font-semibold text-green-600">{loan.terms.interestRate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Amount Due</p>
              <p className="font-semibold">{loan.amountDue} ETH</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Repaid</p>
              <p className="font-semibold">{loan.amountRepaid} ETH</p>
            </div>
          </div>

          {/* Additional Info */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span>Counterparty:</span>
              <AddressDisplay 
                address={isBorrower ? loan.lender : loan.borrower} 
                shortened={true}
              />
            </div>
            <div>Duration: {loan.terms.duration}</div>
            <div className={isOverdue ? 'text-red-600 font-medium' : ''}>
              Due: {formatDate(loan.dueTime)}
            </div>
          </div>

          {/* Progress Bar for Active Loans */}
          {loan.status === 'ACTIVE' && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Repayment Progress</span>
                <span>{((parseFloat(loan.amountRepaid) / parseFloat(loan.amountDue)) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${isOverdue ? 'bg-red-600' : 'bg-blue-600'}`}
                  style={{ 
                    width: `${Math.min((parseFloat(loan.amountRepaid) / parseFloat(loan.amountDue)) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {loan.status === 'ACTIVE' && isBorrower && (
          <div className="flex flex-col gap-2 lg:ml-4">
            <Button 
              variant={isOverdue ? 'danger' : 'primary'}
              onClick={() => onRepay(loan)}
            >
              {isOverdue ? 'Repay Now (Overdue)' : 'Make Repayment'}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

// Repay Loan Modal
const RepayLoanModal = ({ isOpen, onClose, loan, onSuccess }) => {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!loan) return null;

  const remainingAmount = parseFloat(loan.remainingAmount || loan.amountDue);
  const maxRepayment = remainingAmount.toFixed(4);

  const handleRepay = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // TODO: Implement actual contract call
      // const tx = await contracts.lendingPool.repayLoan(loan.loanId, ethers.parseEther(amount));
      // await tx.wait();
      
      // Simulate success
      setTimeout(() => {
        onSuccess();
        setLoading(false);
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to repay loan');
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Repay Loan" size="md">
      <form onSubmit={handleRepay} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Card className="bg-blue-50 border border-blue-200">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Loan ID</span>
              <span className="font-semibold">#{loan.loanId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Total Due</span>
              <span className="font-semibold">{loan.amountDue} ETH</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Already Repaid</span>
              <span className="font-semibold">{loan.amountRepaid} ETH</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm font-medium">Remaining</span>
              <span className="font-bold text-lg">{maxRepayment} ETH</span>
            </div>
          </div>
        </Card>

        <Input
          label="Repayment Amount (ETH)"
          type="number"
          step="0.0001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />

        <div className="flex gap-2">
          <Button 
            type="button"
            variant="outline" 
            onClick={() => setAmount((remainingAmount * 0.25).toFixed(4))}
            className="flex-1"
          >
            25%
          </Button>
          <Button 
            type="button"
            variant="outline" 
            onClick={() => setAmount((remainingAmount * 0.5).toFixed(4))}
            className="flex-1"
          >
            50%
          </Button>
          <Button 
            type="button"
            variant="outline" 
            onClick={() => setAmount((remainingAmount * 0.75).toFixed(4))}
            className="flex-1"
          >
            75%
          </Button>
          <Button 
            type="button"
            variant="outline" 
            onClick={() => setAmount(maxRepayment)}
            className="flex-1"
          >
            100%
          </Button>
        </div>

        {loan.isOverdue && (
          <Alert variant="warning">
            This loan is overdue. Please repay as soon as possible to avoid further penalties.
          </Alert>
        )}

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            loading={loading} 
            disabled={!amount || parseFloat(amount) <= 0}
            className="flex-1"
          >
            Repay {amount ? `${amount} ETH` : 'Loan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default MyLoansPage;