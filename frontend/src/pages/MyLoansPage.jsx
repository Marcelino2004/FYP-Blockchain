import React, { useState } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useLoans } from '../hooks';
import { ethers } from 'ethers';
import { 
  Card, 
  Button, 
  Badge, 
  LoadingSpinner, 
  EmptyState,
  Modal,
  Input,
  Alert,
  AddressDisplay,
  CollateralWithdrawButton
} from '../components';
import { formatCurrency, formatTimeAgo, formatDate } from '../utils/formatters';
import { LOAN_STATUS_LABELS } from '../utils/constants';

const MyLoansPage = () => {
  const { account, contracts, approveToken } = useWeb3();
  const { loans, loading, refetch } = useLoans(account);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [repayModalOpen, setRepayModalOpen] = useState(false);

  const getFilteredLoans = () => {
    if (activeTab === 'borrowed') return loans.filter(l => l.borrower.toLowerCase() === account?.toLowerCase());
    if (activeTab === 'lent') return loans.filter(l => l.lender.toLowerCase() === account?.toLowerCase());
    return loans;
  };

  const filteredLoans = getFilteredLoans();
  const borrowedLoans = loans.filter(l => l.borrower.toLowerCase() === account?.toLowerCase());
  const lentLoans = loans.filter(l => l.lender.toLowerCase() === account?.toLowerCase());

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
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Loans</h1>
        <p className="text-gray-600">Manage your active and completed loans</p>
      </div>

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

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredLoans.length > 0 ? (
        <div className="space-y-4">
          {filteredLoans.map((loan, index) => (
            <LoanCard 
              key={`loan-${loan.loanId}-${index}`} 
              loan={loan}
              currentAccount={account}
              onRepay={handleRepay}
              onWithdrawSuccess={() => setTimeout(refetch, 2000)}
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

const LoanCard = ({ loan, currentAccount, onRepay, onWithdrawSuccess }) => {
  const { contracts } = useWeb3();                    // ← make sure contracts is destructured
  const [liquidating, setLiquidating] = useState(false); // ← add this

  const isBorrower = loan.borrower.toLowerCase() === currentAccount?.toLowerCase();
  const isLender = loan.lender.toLowerCase() === currentAccount?.toLowerCase();
  const isOverdue = loan.status === 'ACTIVE' && loan.isOverdue;
  const hasCollateral = loan.collateralDepositId && String(loan.collateralDepositId) !== '0';

  // Lender can liquidate if: overdue + past grace period (1 hour after lock)
  // For simplicity we just expose the button when overdue — contract will revert
  // with GracePeriodActive if it's too early, giving a clear error.
  const canLiquidate = isLender && isOverdue;

  const handleLiquidate = async () => {
  setLiquidating(true);
    try {
      const loanData = await contracts.lendingPool.getLoan(loan.loanId);
      console.log('collateralDepositId on chain:', loanData.collateralDepositId.toString());
      console.log('collateralAmount in terms:', loanData.terms.collateralAmount.toString());
      const tx = await contracts.lendingPool.liquidateLoan(loan.loanId);
      await tx.wait();
      onWithdrawSuccess();
    } catch (err) {
      console.error('Full liquidation error:', err);
      
      let msg = 'Liquidation failed';
      if (err.message?.includes('GracePeriodActive')) {
        msg = 'Grace period still active — wait 1 hour after loan lock time';
      } else if (err.message?.includes('LoanNotOverdue')) {
        msg = 'Loan is not overdue yet';
      } else if (err.message?.includes('LoanNotActive')) {
        msg = 'Loan is not active';
      } else if (err.reason) {
        msg = err.reason;
      } else if (err.message) {
        msg = err.message;
      }
      alert(msg);
    } finally {
      setLiquidating(false);
    }
  };

  

  const getStatusBadge = () => {
    const status = loan.status;
    if (status === 'ACTIVE' && isOverdue) {
      return <Badge variant="danger">⚠️ Overdue</Badge>;
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

  const needsRepayment = isBorrower && loan.status === 'ACTIVE' && parseFloat(loan.remainingAmount) > 0;

  return (
    <Card hover>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-semibold">Loan #{loan.loanId}</h3>
            {getStatusBadge()}
            <Badge variant={isBorrower ? 'info' : 'success'}>
              {isBorrower ? 'Borrower' : 'Lender'}
            </Badge>
          </div>

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

        {/* Right-hand action column */}
        <div className="flex flex-col gap-3 lg:ml-4 lg:min-w-[180px]">
          {needsRepayment && (
            <div className="flex flex-col gap-2">
              <Button 
                variant={isOverdue ? 'danger' : 'primary'}
                onClick={() => onRepay(loan)}
              >
                {isOverdue ? '⚠️ Repay Now (Overdue)' : '💰 Make Repayment'}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Remaining: {loan.remainingAmount} ETH
              </p>
            </div>
          )}

          {canLiquidate && (
            <div className="flex flex-col gap-1">
              <Button
                variant="danger"
                onClick={handleLiquidate}
                loading={liquidating}
                disabled={liquidating}
              >
                {liquidating ? 'Liquidating...' : '⚡ Liquidate Loan'}
              </Button>
              <p className="text-xs text-gray-500 text-center">
                {hasCollateral
                  ? 'Seize collateral to recover funds'
                  : 'Mark default — no collateral to seize'}
              </p>
            </div>
          )}

          {/* CollateralWithdrawButton self-hides when not relevant (status !== REPAID,
              no depositId, or already withdrawn) — no extra guard needed here */}
          {isBorrower && (
            <CollateralWithdrawButton
              loan={loan}
              onSuccess={onWithdrawSuccess}
            />
          )}
        </div>
      </div>
    </Card>
  );
};

const RepayLoanModal = ({ isOpen, onClose, loan, onSuccess }) => {
  const { contracts, approveToken } = useWeb3();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!loan) return null;

  const remainingAmount = parseFloat(loan.remainingAmount || loan.amountDue);
  const maxRepayment = remainingAmount.toFixed(4);
  const isOverdue = loan.isOverdue;
  const hasCollateral = parseFloat(loan.terms.collateralAmount) > 0;

  const handleRepay = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!contracts.lendingPool) {
        throw new Error('Contracts not initialized. Please reconnect your wallet.');
      }

      if (!amount || parseFloat(amount) <= 0) {
        throw new Error('Please enter a valid repayment amount');
      }

      const repaymentAmount = ethers.parseEther(amount);
      const tokenAddress = loan.terms.tokenAddress;

      console.log('💰 Repaying loan:', { loanId: loan.loanId, amount, tokenAddress });

      console.log('1️⃣ Approving token spending...');
      await approveToken(
        tokenAddress,
        await contracts.lendingPool.getAddress(),
        repaymentAmount
      );
      console.log('   ✅ Token approved');

      console.log('2️⃣ Repaying loan...');
      const tx = await contracts.lendingPool.repayLoan(loan.loanId, repaymentAmount);
      console.log('⏳ Waiting for confirmation...', tx.hash);
      const receipt = await tx.wait();
      console.log('✅ Loan repayment successful!', receipt);

      const isFullRepayment = parseFloat(amount) >= remainingAmount - 0.0001;

      if (isFullRepayment && hasCollateral) {
        alert(
          `✅ Loan fully repaid!\n\n` +
          `Your collateral has been unlocked. ` +
          `Click "Withdraw Collateral" on this loan card to reclaim it.`
        );
      } else {
        alert(`Successfully repaid ${amount} ETH!`);
      }

      onSuccess();
      setLoading(false);
    } catch (err) {
      console.error('❌ Error repaying loan:', err);
      
      let errorMessage = 'Failed to repay loan';
      if (err.message.includes('insufficient')) {
        errorMessage = 'Insufficient token balance';
      } else if (err.message.includes('user rejected')) {
        errorMessage = 'Transaction rejected by user';
      } else if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Repay Loan" size="md">
      <form onSubmit={handleRepay} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {isOverdue && (
          <Alert variant="warning">
            ⚠️ This loan is overdue! Please repay as soon as possible to avoid penalties and potential liquidation.
          </Alert>
        )}

        <Card className="bg-blue-50 border border-blue-200">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Loan ID</span>
              <span className="font-semibold">#{loan.loanId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Loan Token</span>
              <span className="font-mono text-sm">{loan.terms.tokenAddress.slice(0, 10)}...</span>
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
              <span className="font-bold text-lg text-blue-900">{maxRepayment} ETH</span>
            </div>
          </div>
        </Card>

        <Input
          label="Repayment Amount (in loan token)"
          type="number"
          step="0.0001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          required
        />

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setAmount((remainingAmount * 0.25).toFixed(4))} className="flex-1">25%</Button>
          <Button type="button" variant="outline" onClick={() => setAmount((remainingAmount * 0.5).toFixed(4))} className="flex-1">50%</Button>
          <Button type="button" variant="outline" onClick={() => setAmount((remainingAmount * 0.75).toFixed(4))} className="flex-1">75%</Button>
          <Button type="button" variant="outline" onClick={() => setAmount(maxRepayment)} className="flex-1">100%</Button>
        </div>

        <Alert variant="info">
          💡 Collateral can only be unlocked after full repayment is made 
          {hasCollateral && (
            <p className="mt-2 text-sm font-medium text-blue-800">
              🔒 After <strong>full</strong> repayment, a "Withdraw Collateral" button will appear on this loan card.
            </p>
          )}
        </Alert>

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
            {loading ? 'Processing...' : `Repay ${amount || '0'} ETH`}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default MyLoansPage;