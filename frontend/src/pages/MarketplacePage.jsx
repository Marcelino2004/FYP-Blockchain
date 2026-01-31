// frontend/src/pages/MarketplacePage.jsx
import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useMarketplace } from '../hooks';
import { 
  Card, 
  Button, 
  Badge, 
  LoadingSpinner, 
  EmptyState,
  Modal,
  Input,
  Select,
  Alert,
  AddressDisplay
} from '../components';
import { formatPercentage, formatCurrency } from '../utils/formatters';
import { ethers } from 'ethers';
import { TOKEN_ADDRESSES } from '../utils/constants';


const MarketplacePage = () => {
  const { account, contracts } = useWeb3();
  const { lenderOffers, borrowerRequests, loading, refetch } = useMarketplace();
  const [activeTab, setActiveTab] = useState('all'); // all, lender, borrower
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  // Filter offers based on active tab
  const getFilteredOffers = () => {
    if (activeTab === 'lender') return lenderOffers;
    if (activeTab === 'borrower') return borrowerRequests;
    return [...lenderOffers, ...borrowerRequests];
  };

  const filteredOffers = getFilteredOffers();

  const handleAcceptOffer = (offer) => {
    // Prevent users from accepting their own offers
    if (offer.creator.toLowerCase() === account.toLowerCase()) {
      alert("You cannot accept your own offer!");
      return;
    }
    setSelectedOffer(offer);
    setAcceptModalOpen(true);
  };

  const handleCancelOffer = async (offerId) => {
    if (!contracts.lendingPool) {
      alert('Contracts not initialized. Please reconnect your wallet.');
      return;
    }

    if (!window.confirm('Are you sure you want to cancel this offer?')) {
      return;
    }

    setCancelling(offerId);

    try {
      console.log('🚫 Cancelling offer:', offerId);
      const tx = await contracts.lendingPool.cancelLoanOffer(offerId);
      console.log('⏳ Waiting for confirmation...', tx.hash);
      await tx.wait();
      console.log('✅ Offer cancelled successfully');
      
      // Refresh the marketplace
      refetch();
      alert('Offer cancelled successfully!');
    } catch (err) {
      console.error('❌ Error cancelling offer:', err);
      alert(`Failed to cancel offer: ${err.message || 'Unknown error'}`);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Marketplace</h1>
          <p className="text-gray-600">Browse and accept loan offers from lenders and borrowers</p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => setCreateModalOpen(true)}
          disabled={!account}
        >
          Create Offer
        </Button>
      </div>

      {!account && (
        <Alert variant="warning">
          Please connect your wallet to create or accept offers
        </Alert>
      )}

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
          All Offers
          <Badge variant="default" className="ml-2">
            {lenderOffers.length + borrowerRequests.length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab('lender')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'lender'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Lender Offers
          <Badge variant="success" className="ml-2">
            {lenderOffers.length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab('borrower')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'borrower'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Borrow Requests
          <Badge variant="info" className="ml-2">
            {borrowerRequests.length}
          </Badge>
        </button>
      </div>

      {/* Offers Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredOffers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOffers.map((offer) => (
            <OfferCard 
              key={offer.offerId} 
              offer={offer} 
              onAccept={handleAcceptOffer}
              onCancel={handleCancelOffer}
              currentAccount={account}
              cancelling={cancelling === offer.offerId}
            />
          ))}
        </div>
      ) : (
        <EmptyState 
          title="No offers available"
          description="There are no active offers in the marketplace. Be the first to create one!"
          action={
            account && (
              <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
                Create Offer
              </Button>
            )
          }
        />
      )}

      {/* Create Offer Modal */}
      <CreateOfferModal 
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false);
          refetch();
        }}
      />

      {/* Accept Offer Modal */}
      <AcceptOfferModal 
        isOpen={acceptModalOpen}
        onClose={() => setAcceptModalOpen(false)}
        offer={selectedOffer}
        onSuccess={() => {
          setAcceptModalOpen(false);
          refetch();
        }}
      />
    </div>
  );
};

// Offer Card Component
const OfferCard = ({ offer, onAccept, onCancel, currentAccount, cancelling }) => {
  const isLenderOffer = offer.offerType === 'LENDER_OFFER';
  const isOwnOffer = currentAccount && offer.creator.toLowerCase() === currentAccount.toLowerCase();

  return (
    <Card hover className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <Badge variant={isLenderOffer ? 'success' : 'info'}>
            {isLenderOffer ? 'Lender Offer' : 'Borrow Request'}
          </Badge>
          {isOwnOffer && (
            <Badge variant="warning" className="ml-2">Your Offer</Badge>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {offer.terms.principalAmount} ETH
          </p>
          <p className="text-sm text-gray-500">Principal</p>
        </div>
      </div>

      <div className="space-y-3 mb-4 flex-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Creator</span>
          <AddressDisplay address={offer.creator} shortened={true} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Interest Rate</span>
          <span className="font-medium text-green-600">{offer.terms.interestRate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Duration</span>
          <span className="font-medium">{offer.terms.duration}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Min. Reputation</span>
          <span className="font-medium">{offer.terms.minReputation}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Collateral Ratio</span>
          <span className="font-medium">{offer.terms.collateralRatio}</span>
        </div>
      </div>

      {/* Action Button - Shows Cancel for own offers, Accept for others */}
      {isOwnOffer ? (
        <Button 
          variant="danger" 
          onClick={() => onCancel(offer.offerId)}
          disabled={cancelling}
          loading={cancelling}
          className="w-full"
        >
          {cancelling ? 'Cancelling...' : '🗑️ Cancel Offer'}
        </Button>
      ) : (
        <Button 
          variant={isLenderOffer ? 'success' : 'primary'} 
          onClick={() => onAccept(offer)}
          disabled={!currentAccount}
          className="w-full"
        >
          {isLenderOffer ? 'Borrow Now' : 'Lend Now'}
        </Button>
      )}
    </Card>
  );
};

const CreateOfferModal = ({ isOpen, onClose, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [offerType, setOfferType] = useState('LENDER_OFFER');
  const [selectedToken, setSelectedToken] = useState('WETH');
  const [formData, setFormData] = useState({
    principalAmount: '',
    interestRate: '10',
    duration: '30',
    minReputation: '100',
    collateralRatio: '150',
    collateralAmount: '0',
    collateralToken: '0x0000000000000000000000000000000000000000',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!contracts.lendingPool) {
        throw new Error('Contracts not initialized. Please reconnect your wallet.');
      }

      if (!account) {
        throw new Error('Please connect your wallet first.');
      }

      const tokenAddress = TOKEN_ADDRESSES[selectedToken];
      
      if (!tokenAddress) {
        throw new Error('Invalid token selected');
      }

      const loanTerms = {
        tokenAddress: tokenAddress,
        principalAmount: ethers.parseEther(formData.principalAmount),
        collateralAmount: ethers.parseEther(formData.collateralAmount),
        collateralToken: formData.collateralToken,
        interestRate: Math.floor(parseFloat(formData.interestRate) * 100),
        duration: parseInt(formData.duration) * 86400,
        minReputation: parseInt(formData.minReputation),
        collateralRatio: Math.floor(parseFloat(formData.collateralRatio) * 100),
      };

      const offerTypeValue = offerType === 'LENDER_OFFER' ? 0 : 1;

      console.log('📝 Creating loan offer with:', { offerTypeValue, loanTerms });

      if (offerType === 'LENDER_OFFER') {
        console.log('💰 Approving token spending...');
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          contracts.lendingPool.runner
        );
        
        const approveTx = await tokenContract.approve(
          await contracts.lendingPool.getAddress(),
          loanTerms.principalAmount
        );
        await approveTx.wait();
        console.log('✅ Token approved');
      }

      console.log('📤 Sending transaction...');
      const tx = await contracts.lendingPool.createLoanOffer(
        offerTypeValue,
        loanTerms
      );
      
      console.log('⏳ Waiting for confirmation...', tx.hash);
      const receipt = await tx.wait();
      console.log('✅ Transaction confirmed!', receipt);

      onSuccess();
      setLoading(false);
    } catch (err) {
      console.error('❌ Error creating offer:', err);
      setError(err.message || 'Failed to create offer');
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Loan Offer" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Select
          label="Offer Type"
          value={offerType}
          onChange={(e) => setOfferType(e.target.value)}
          options={[
            { value: 'LENDER_OFFER', label: 'Lender Offer (I want to lend)' },
            { value: 'BORROW_REQUEST', label: 'Borrow Request (I want to borrow)' },
          ]}
          required
        />

        <Select
          label="Loan Token"
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
          options={[
            { value: 'WETH', label: 'WETH (Wrapped ETH)' },
            { value: 'USDC', label: 'USDC (USD Coin)' },
            { value: 'WBTC', label: 'WBTC (Wrapped Bitcoin)' },
          ]}
          required
        />

        <Input
          label="Principal Amount"
          type="number"
          step="0.01"
          value={formData.principalAmount}
          onChange={(e) => setFormData({ ...formData, principalAmount: e.target.value })}
          placeholder="0.00"
          required
        />

        <Input
          label="Interest Rate (%)"
          type="number"
          step="0.1"
          value={formData.interestRate}
          onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })}
          placeholder="10"
          required
        />

        <Input
          label="Duration (days)"
          type="number"
          value={formData.duration}
          onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
          placeholder="30"
          required
        />

        <Input
          label="Minimum Reputation"
          type="number"
          value={formData.minReputation}
          onChange={(e) => setFormData({ ...formData, minReputation: e.target.value })}
          placeholder="100"
          required
        />

        <Input
          label="Collateral Ratio (%)"
          type="number"
          value={formData.collateralRatio}
          onChange={(e) => setFormData({ ...formData, collateralRatio: e.target.value })}
          placeholder="150"
          required
        />

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading} className="flex-1">
            Create Offer
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// Accept Offer Modal
const AcceptOfferModal = ({ isOpen, onClose, offer, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collateralDepositId, setCollateralDepositId] = useState('');
  const [needsCollateral, setNeedsCollateral] = useState(false);

  useEffect(() => {
    if (offer && offer.offerType === 'LENDER_OFFER') {
      setNeedsCollateral(parseFloat(offer.terms.collateralAmount) > 0);
    } else {
      setNeedsCollateral(false);
    }
  }, [offer]);

  if (!offer) return null;

  const isLenderOffer = offer.offerType === 'LENDER_OFFER';

  const handleAccept = async () => {
    setLoading(true);
    setError('');

    try {
      if (!contracts.lendingPool) {
        throw new Error('Contracts not initialized. Please connect your wallet.');
      }

      console.log('📝 Accepting offer:', offer.offerId);

      if (isLenderOffer) {
        const depositId = needsCollateral ? parseInt(collateralDepositId) : 0;

        console.log('💼 Borrower accepting lender offer');
        console.log('   Offer ID:', offer.offerId);
        console.log('   Collateral Deposit ID:', depositId);

        const tx = await contracts.lendingPool.acceptLoanOffer(
          offer.offerId,
          depositId
        );

        console.log('⏳ Waiting for confirmation...', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Loan accepted!', receipt);
      } else {
        console.log('💰 Lender accepting borrow request');

        const principalAmount = ethers.parseEther(offer.terms.principalAmount);
        const tokenAddress = offer.terms.tokenAddress;

        console.log('   Approving', offer.terms.principalAmount, 'tokens...');

        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          contracts.lendingPool.runner
        );

        const approveTx = await tokenContract.approve(
          await contracts.lendingPool.getAddress(),
          principalAmount
        );
        await approveTx.wait();
        console.log('   ✅ Token approved');

        const tx = await contracts.lendingPool.acceptLoanOffer(
          offer.offerId,
          0
        );

        console.log('⏳ Waiting for confirmation...', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Loan accepted!', receipt);
      }

      onSuccess();
      setLoading(false);
      setCollateralDepositId('');
    } catch (err) {
      console.error('❌ Error accepting offer:', err);
      
      let errorMessage = 'Failed to accept offer';
      if (err.message.includes('insufficient')) {
        errorMessage = 'Insufficient balance or allowance';
      } else if (err.message.includes('reputation')) {
        errorMessage = 'Your reputation does not meet the minimum requirement';
      } else if (err.message.includes('collateral')) {
        errorMessage = 'Invalid or insufficient collateral';
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
    <Modal isOpen={isOpen} onClose={onClose} title="Accept Loan Offer" size="md">
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info">
          {isLenderOffer 
            ? "You are accepting this loan as a BORROWER. You will receive the principal amount."
            : "You are accepting this loan as a LENDER. You will provide the principal amount."
          }
        </Alert>

        <Card className="bg-gray-50">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Offer Type</span>
              <Badge variant={isLenderOffer ? 'success' : 'info'}>
                {isLenderOffer ? 'Lender Offer' : 'Borrow Request'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Principal Amount</span>
              <span className="font-semibold">{offer.terms.principalAmount} ETH</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Interest Rate</span>
              <span className="font-semibold text-green-600">{offer.terms.interestRate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Duration</span>
              <span className="font-semibold">{offer.terms.duration}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Collateral Ratio</span>
              <span className="font-semibold">{offer.terms.collateralRatio}</span>
            </div>
            {isLenderOffer && (
              <div className="flex justify-between">
                <span className="text-gray-600">Min. Reputation Required</span>
                <span className="font-semibold">{offer.terms.minReputation}</span>
              </div>
            )}
          </div>
        </Card>

        {isLenderOffer && needsCollateral && (
          <div>
            <Alert variant="warning">
              This loan requires collateral. Please deposit collateral first using the Collateral page, 
              then enter the deposit ID here.
            </Alert>
            <Input
              label="Collateral Deposit ID"
              type="number"
              value={collateralDepositId}
              onChange={(e) => setCollateralDepositId(e.target.value)}
              placeholder="Enter your collateral deposit ID"
              required={needsCollateral}
            />
          </div>
        )}

        <Card className="bg-blue-50 border-2 border-blue-200">
          <div className="space-y-2">
            <p className="font-semibold text-blue-900">What happens next:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              {isLenderOffer ? (
                <>
                  <li>You'll receive {offer.terms.principalAmount} ETH (minus 1% platform fee)</li>
                  <li>Your collateral will be locked until loan is repaid</li>
                  <li>You must repay {offer.terms.principalAmount} ETH + {offer.terms.interestRate} interest</li>
                  <li>Loan must be repaid within {offer.terms.duration}</li>
                </>
              ) : (
                <>
                  <li>You'll provide {offer.terms.principalAmount} ETH to the borrower</li>
                  <li>Borrower's collateral will be locked as security</li>
                  <li>You'll receive principal + {offer.terms.interestRate} interest when repaid</li>
                  <li>If borrower defaults, you can liquidate their collateral</li>
                </>
              )}
            </ul>
          </div>
        </Card>

        <div className="flex gap-4 pt-4">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            loading={loading} 
            onClick={handleAccept}
            className="flex-1"
          >
            {loading ? 'Processing...' : 'Accept Offer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default MarketplacePage;