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

// ✅ Token price helper (mock prices - in production, fetch from PriceOracle contract)
const TOKEN_PRICES = {
  WETH: 3000,  // $3000 per WETH
  USDC: 1,     // $1 per USDC
  WBTC: 100000 // $100,000 per WBTC
};

// ✅ Token metadata with decimals
const TOKEN_INFO = {
  WETH: { decimals: 18, price: 3000 },
  USDC: { decimals: 6, price: 1 },
  WBTC: { decimals: 8, price: 100000 }
};

// ✅ Get token info helper
const getTokenInfo = (tokenSymbol) => {
  return TOKEN_INFO[tokenSymbol] || { decimals: 18, price: 1 };
};

// ✅ Parse token amount with proper decimals
const parseTokenAmount = (amount, tokenSymbol) => {
  const info = getTokenInfo(tokenSymbol);
  
  try {
    let numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (numAmount === 0 || isNaN(numAmount) || numAmount < 0) {
      return BigInt(0);
    }
    
    const multiplier = Math.pow(10, info.decimals);
    numAmount = Math.round(numAmount * multiplier) / multiplier;
    
    const amountStr = numAmount.toFixed(info.decimals);
    
    if (amountStr === '0.000000000000000000' || parseFloat(amountStr) === 0) {
      console.warn(`⚠️ Amount ${amount} rounds to zero for ${tokenSymbol}`);
      return BigInt(0);
    }
    
    if (info.decimals === 18) {
      return ethers.parseEther(amountStr);
    } else if (info.decimals === 6) {
      return ethers.parseUnits(amountStr, 6);
    } else if (info.decimals === 8) {
      return ethers.parseUnits(amountStr, 8);
    }
    return ethers.parseEther(amountStr);
  } catch (error) {
    console.error('❌ Error parsing token amount:', { amount, tokenSymbol, error });
    return BigInt(0);
  }
};

// ✅ Format token amount to readable string with decimals
const formatTokenAmount = (amount, tokenSymbol) => {
  if (!amount || amount === '0' || amount === 0) return '0.0000';
  
  const info = getTokenInfo(tokenSymbol);
  
  try {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;
    
    if (typeof amountStr === 'string' && !amountStr.startsWith('0x')) {
      const rawAmount = ethers.parseEther(amountStr);
      const formatted = ethers.formatUnits(rawAmount, info.decimals);
      return parseFloat(formatted).toFixed(4);
    }
    
    const formatted = ethers.formatUnits(amount, info.decimals);
    return parseFloat(formatted).toFixed(4);
  } catch (error) {
    console.error('Error formatting token amount:', error, 'Amount:', amount, 'Type:', typeof amount);
    return '0.0000';
  }
};

// ✅ Helper to calculate collateral amount accounting for price differences
const calculateCollateralInToken = (principalAmount, principalToken, collateralToken, collateralRatio) => {
  if (!principalAmount || !collateralRatio) return '0';
  
  const principalInfo = getTokenInfo(principalToken);
  const collateralInfo = getTokenInfo(collateralToken);
  
  const principalValueUSD = parseFloat(principalAmount) * principalInfo.price;
  const requiredCollateralUSD = principalValueUSD * (parseFloat(collateralRatio) / 100);
  const collateralAmount = requiredCollateralUSD / collateralInfo.price;
  
  return collateralAmount.toFixed(4);
};

// ─── Shared error parser ──────────────────────────────────────────────────────
// Maps known 4-byte selectors to human-readable messages as a fallback when
// ethers cannot decode the revert (e.g. ABI not loaded yet).
const CUSTOM_ERROR_SELECTORS = {
  '0xd6938968': 'Invalid collateral ratio — ratio must be at least 120% if collateral is required, or exactly 0% for uncollateralized loans.',
  '0xc0b84ad1': 'Your reputation score does not meet the minimum requirement for this offer.',
  '0x4813f38b': 'Insufficient collateral — please ensure you have deposited enough collateral.',
  '0x8c7f6fb3': 'This offer is no longer active.',
  '0x1f2a2005': 'Invalid loan amount — principal must be greater than 0.',
  '0x4c4fc93a': 'Invalid loan duration — must be between 1 and 365 days.',
  '0x8f400791': 'Invalid interest rate — cannot exceed 50%.',
  '0x6f861db7': 'Offer not found.',
  '0xba5574da': 'Offer is no longer active.',
  '0x21719c94': 'Co-signer cannot be lender on the same loan',
  '0x00536a21': 'Only 1 co-signer request can be created for an offer at any time',
};

// Maps ABI-decoded custom error names to human-readable messages.
const CUSTOM_ERROR_NAMES = {
  'LendingPool__InvalidCollateralRatio': 'Invalid collateral ratio — ratio must be at least 120% if collateral is required, or exactly 0% for uncollateralized loans.',
  'LendingPool__InsufficientReputation': 'Your reputation score does not meet the minimum requirement for this offer.',
  'LendingPool__InsufficientCollateral': 'Insufficient collateral — please ensure you have deposited enough collateral.',
  'LendingPool__OfferNotActive':         'This offer is no longer active.',
  'LendingPool__OfferNotFound':          'Offer not found.',
  'LendingPool__InvalidAmount':          'Invalid loan amount — principal must be greater than 0.',
  'LendingPool__InvalidDuration':        'Invalid loan duration — must be between 1 and 365 days.',
  'LendingPool__InvalidInterestRate':    'Invalid interest rate — cannot exceed 50%.',
  'LendingPool__ZeroAddress':            'Invalid address provided.',
  'LendingPool__LoanNotActive':          'This loan is no longer active.',
  'LendingPool__InvalidRepaymentAmount': 'Invalid repayment amount.',
};

/**
 * Parses a contract error into a user-friendly string.
 * Strategy:
 *   1. Try interface.parseError() for full ABI-based decoding (most accurate).
 *   2. Fall back to the known 4-byte selector map.
 *   3. Fall back to err.reason / err.message string matching.
 *
 * @param {Error} err       - The caught error object
 * @param {Object} contract - An ethers Contract instance (for interface.parseError)
 * @param {string} fallback - Default message if nothing matches
 */
const parseContractError = (err, contract = null, fallback = 'Transaction failed.') => {
  // Extract raw error data from wherever ethers v6 might put it
  const errorData = err.data
    ?? err.error?.data
    ?? err.info?.error?.data
    ?? null;

  // 1. Try ABI-based decoding via the contract interface
  if (errorData && contract) {
    try {
      const decoded = contract.interface.parseError(errorData);
      if (decoded?.name) {
        return CUSTOM_ERROR_NAMES[decoded.name] ?? `Contract error: ${decoded.name}`;
      }
    } catch {
      // parseError threw — move on to selector map
    }
  }

  // 2. Try known 4-byte selector map
  if (errorData) {
    const selector = String(errorData).slice(0, 10).toLowerCase();
    if (CUSTOM_ERROR_SELECTORS[selector]) {
      return CUSTOM_ERROR_SELECTORS[selector];
    }
  }

  // 3. Plain-text fallbacks
  if (err.message?.includes('user rejected') || err.message?.includes('User denied')) {
    return 'Transaction rejected by user.';
  }
  if (err.message?.includes('insufficient funds')) {
    return 'Insufficient funds to cover gas fees.';
  }
  if (err.reason) return err.reason;
  if (err.message) return err.message;

  return fallback;
};
// ─────────────────────────────────────────────────────────────────────────────

const MarketplacePage = () => {
  const { account, contracts } = useWeb3();
  const { lenderOffers, borrowerRequests, loading, refetch } = useMarketplace();
  const [activeTab, setActiveTab] = useState('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);

  const getFilteredOffers = () => {
    if (activeTab === 'lender') return lenderOffers;
    if (activeTab === 'borrower') return borrowerRequests;
    return [...lenderOffers, ...borrowerRequests];
  };

  const filteredOffers = getFilteredOffers();

  const handleAcceptOffer = (offer) => {
    setSelectedOffer(offer);
    setAcceptModalOpen(true);
  };

  const handleCancelOffer = async (offer) => {
    if (!contracts.lendingPool) return;
    
    try {
      console.log('🚫 Cancelling offer:', offer.offerId);
      const tx = await contracts.lendingPool.cancelLoanOffer(offer.offerId);
      await tx.wait();
      console.log('✅ Offer cancelled');
      refetch();
    } catch (err) {
      console.error('❌ Error cancelling offer:', err);
      alert('Failed to cancel offer: ' + parseContractError(err, contracts.lendingPool));
    }
  };

  return (
    <div className="space-y-8">
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

      <CreateOfferModal 
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          setCreateModalOpen(false);
          refetch();
        }}
      />

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

const getTokenSymbol = (address) => {
  if (!address || address === ethers.ZeroAddress) return null;
  const lowerAddress = address.toLowerCase();
  
  for (const [symbol, addr] of Object.entries(TOKEN_ADDRESSES)) {
    if (addr.toLowerCase() === lowerAddress) {
      return symbol;
    }
  }
  
  return 'Unknown';
};

const OfferCard = ({ offer, onAccept, onCancel, currentAccount }) => {
  const { contracts } = useWeb3();
  const isLenderOffer = offer.offerType === 'LENDER_OFFER';
  const isOwnOffer = offer.creator?.toLowerCase() === currentAccount?.toLowerCase();

  const loanTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
  const collateralTokenSymbol = getTokenSymbol(offer.terms.collateralToken);

  const [borrowerRep, setBorrowerRep] = useState(null);
  const [hasCosignerBoost, setHasCosignerBoost] = useState(false);
  const [effectiveRep, setEffectiveRep] = useState(null);

  useEffect(() => {
  if (isLenderOffer || !contracts?.reputationManager) return;
  let cancelled = false;

  const load = async () => {
    try {
      const score = await contracts.reputationManager.getReputationScore(offer.creator);
      const baseRep = Number(score);

      // Check if this specific offer has a pending co-sign bonus
      const pendingBonus = await contracts.reputationManager.coSigningBonusByOffer(
        offer.creator,
        offer.offerId
      );
      const bonus = Number(pendingBonus);

      if (!cancelled) {
        setBorrowerRep(baseRep);
        setHasCosignerBoost(bonus > 0);
        setEffectiveRep(bonus > 0 ? baseRep + bonus : baseRep); // ✅ boosted score
      }
    } catch { /* fail silently */ }
  };

  load();
  return () => { cancelled = true; };
}, [offer.creator, offer.offerId, isLenderOffer, contracts]);

  const repColor = (s) =>
    s >= 600 ? 'text-green-600' :
    s >= 400 ? 'text-blue-600'  :
    s >= 200 ? 'text-yellow-600' : 'text-red-500';

  return (
    <Card hover={!isOwnOffer} className="flex flex-col h-full">
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
            {offer.terms.principalAmount} {loanTokenSymbol}
          </p>
          <p className="text-sm text-gray-500">Principal</p>
        </div>
      </div>

      <div className="space-y-3 mb-4 flex-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Creator</span>
          <AddressDisplay address={offer.creator} shortened={true} />
        </div>

        {isLenderOffer ? (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-600 mb-1">Collateral Requirement</div>
            <div className="text-lg font-bold text-blue-900">{offer.terms.collateralRatio}</div>
            <div className="text-xs text-blue-600 mt-1">Borrower chooses collateral token</div>
          </div>
        ) : (
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-xs text-purple-600 mb-1">Collateral Offered</div>
            <div className="text-lg font-bold text-purple-900">
              {formatTokenAmount(offer.terms.collateralAmount, collateralTokenSymbol || 'WETH')} {collateralTokenSymbol || 'TBD'}
            </div>
            <div className="text-xs text-purple-600 mt-1">{offer.terms.collateralRatio} ratio</div>
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Interest Rate</span>
          <span className="font-medium text-green-600">{offer.terms.interestRate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Duration</span>
          <span className="font-medium">{offer.terms.duration}</span>
        </div>

        {isLenderOffer ? (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Min. Borrower Reputation</span>
            <span className="font-medium">{offer.terms.minReputation}</span>
          </div>
        ) : (
          <div className="flex justify-between text-sm items-center">
            <span className="text-gray-600">Borrower Reputation</span>
            <div className="flex items-center gap-1.5">
              {effectiveRep !== null ? (
                <>
                  {hasCosignerBoost ? (
                    <span className={`font-semibold ${repColor(effectiveRep)}`}>
                      {borrowerRep}
                      <span className="text-purple-600"> + {effectiveRep - borrowerRep}</span>
                    </span>
                  ) : (
                    <span className={`font-semibold ${repColor(borrowerRep)}`}>
                      {borrowerRep}
                    </span>
                  )}
                  {hasCosignerBoost && (
                    <span
                      title={`Base score: ${borrowerRep} + ${effectiveRep - borrowerRep} co-signing boost. Applied permanently when loan is matched.`}
                      className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-medium"
                    >
                      🤝 Co-signed
                    </span>
                  )}
                </>
              ) : (
                <span className="text-gray-400 text-xs italic">loading…</span>
              )}
            </div>
          </div>
        )}
      </div>

      {isOwnOffer ? (
        <Button variant="danger" onClick={() => onCancel(offer)} className="w-full">
          Cancel Offer
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
  const [selectedBorrowToken, setSelectedBorrowToken] = useState('WETH');
  const [selectedCollateralToken, setSelectedCollateralToken] = useState('USDC');
  const [formData, setFormData] = useState({
    principalAmount: '',
    interestRate: '10',
    duration: '30',
    minReputation: '100',
    collateralRatio: '150',
    collateralAmount: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (formData.principalAmount && formData.collateralRatio) {
      const collateral = calculateCollateralInToken(
        formData.principalAmount,
        selectedBorrowToken,
        selectedCollateralToken,
        formData.collateralRatio
      );
      setFormData(prev => ({ ...prev, collateralAmount: collateral }));
    }
  }, [formData.principalAmount, formData.collateralRatio, selectedBorrowToken, selectedCollateralToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!contracts.lendingPool) {
        throw new Error('Contracts not initialized. Please connect your wallet.');
      }

      const borrowTokenAddress = TOKEN_ADDRESSES[selectedBorrowToken];
      
      if (!borrowTokenAddress) {
        throw new Error('Invalid token selected');
      }

      const collateralTokenAddress = isLenderOffer 
        ? ethers.ZeroAddress 
        : TOKEN_ADDRESSES[selectedCollateralToken];
      
      const collateralAmount = isLenderOffer
        ? ethers.parseEther('0')
        : parseTokenAmount(formData.collateralAmount, selectedCollateralToken);

      if (!isLenderOffer) {
        if (!collateralTokenAddress) {
          throw new Error('Invalid collateral token selected');
        }
        if (borrowTokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase()) {
          throw new Error('Borrow token and collateral token must be different!');
        }
      }

      const loanTerms = {
        tokenAddress: borrowTokenAddress,
        principalAmount: ethers.parseEther(formData.principalAmount),
        collateralToken: collateralTokenAddress,
        collateralAmount: collateralAmount,
        interestRate: Math.floor(parseFloat(formData.interestRate) * 100),
        duration: parseInt(formData.duration) * 86400,
        minReputation: isLenderOffer ? parseInt(formData.minReputation) : 0,
        collateralRatio: Math.floor(parseFloat(formData.collateralRatio) * 100),
      };

      const offerTypeValue = offerType === 'LENDER_OFFER' ? 0 : 1;

      console.log('📝 Creating loan offer:', { offerTypeValue, loanTerms });

      if (offerType === 'LENDER_OFFER') {
        console.log('💰 Approving borrow token spending...');
        const tokenContract = new ethers.Contract(
          borrowTokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          contracts.lendingPool.runner
        );
        
        const approveTx = await tokenContract.approve(
          await contracts.lendingPool.getAddress(),
          loanTerms.principalAmount
        );
        await approveTx.wait();
        console.log('✅ Borrow token approved');
      }

      if (offerType === 'BORROW_REQUEST') {
      const ratioValue = Math.floor(parseFloat(formData.collateralRatio) * 100);
      const hasCollateral = collateralAmount > 0n;

      if (hasCollateral && ratioValue < 12000) {
        throw new Error('Collateral ratio must be at least 120% when collateral is required.');
      }
      if (!hasCollateral && ratioValue !== 0) {
        throw new Error('Collateral ratio must be 0% for uncollateralized loans.');
      }
    }

      let collateralDepositId = 0;
      if (offerType === 'BORROW_REQUEST' && collateralAmount > 0n) {
        console.log('🔒 BORROWER: Depositing collateral before creating request...');
        
        console.log('   💰 Approving collateral token...');
        const collateralTokenContract = new ethers.Contract(
          collateralTokenAddress,
          ['function approve(address spender, uint256 amount) returns (bool)'],
          contracts.collateralManager.runner
        );
        
        const approveTx = await collateralTokenContract.approve(
          await contracts.collateralManager.getAddress(),
          collateralAmount
        );
        await approveTx.wait();
        console.log('   ✅ Collateral approved');
        
        console.log('   Reading nextDepositId to self-reference deposit...');
        const predictedDepositId = await contracts.collateralManager.nextDepositId();
        console.log('   Predicted depositId:', predictedDepositId.toString());

        console.log('   Depositing collateral...');
        const depositTx = await contracts.collateralManager.depositCollateral(
          predictedDepositId,
          collateralTokenAddress,
          collateralAmount
        );
        const depositReceipt = await depositTx.wait();
        console.log('   ✅ Collateral deposited, receipt logs:', depositReceipt.logs.length);

        const event = depositReceipt.logs.find(log => {
          try {
            const parsed = contracts.collateralManager.interface.parseLog(log);
            return parsed?.name === 'CollateralDeposited';
          } catch {
            return false;
          }
        });

        console.log('   CollateralDeposited event found:', !!event);

        if (event) {
          const parsed = contracts.collateralManager.interface.parseLog(event);
          depositId = Number(parsed.args.depositId);
          console.log('   📋 Deposit ID:', depositId);
        } else {
          console.warn('   ⚠️ CollateralDeposited event NOT found in logs');
        }
        
        console.log('   📋 Extracting collateral deposit ID...');
        let foundDepositId = false;
        
        const collateralManagerAddress = (await contracts.collateralManager.getAddress()).toLowerCase();
        
        try {
          for (const log of depositReceipt.logs) {
            if (log.address && log.address.toLowerCase() === collateralManagerAddress) {
              try {
                const parsed = contracts.collateralManager.interface.parseLog({
                  topics: log.topics,
                  data: log.data
                });
                
                if (parsed && parsed.name === 'CollateralDeposited') {
                  collateralDepositId = Number(parsed.args.depositId);
                  console.log('   ✅ Method 1: Found depositId in event:', collateralDepositId);
                  foundDepositId = true;
                  break;
                }
              } catch (e) {
                console.log('   ⚠️  Could not parse log:', e.message);
              }
            }
          }
        } catch (eventParseError) {
          console.log('   ⚠️  Event parsing failed:', eventParseError.message);
        }
        
        if (!foundDepositId) {
          console.log('   🔄 Method 2: Querying user deposits...');
          try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const userDeposits = await contracts.collateralManager.getUserDeposits(account);
            
            if (userDeposits.length > 0) {
              const sortedDeposits = [...userDeposits].sort((a, b) => 
                Number(b.depositId) - Number(a.depositId)
              );
              
              let matchingDeposit = sortedDeposits.find(d => {
                return d.tokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase() &&
                  !d.isLocked &&
                  BigInt(d.amount) === collateralAmount;
              });
              
              if (!matchingDeposit) {
                matchingDeposit = sortedDeposits.find(d => 
                  d.tokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase() &&
                  !d.isLocked
                );
              }
              
              if (matchingDeposit) {
                collateralDepositId = Number(matchingDeposit.depositId);
                console.log('   ✅ Method 2: Found depositId via query:', collateralDepositId);
                foundDepositId = true;
              }
            }
          } catch (queryErr) {
            console.error('   ❌ Query failed:', queryErr.message);
          }
        }
        
        if (!foundDepositId || collateralDepositId === 0) {
          throw new Error('Could not extract collateral deposit ID. The deposit was successful, but the ID could not be retrieved automatically. Please check the Collateral page to see your deposit ID.');
        }
      }

      console.log('📤 Sending transaction...');
      const tx = await contracts.lendingPool.createLoanOffer(
        offerTypeValue,
        loanTerms
      );
      
      console.log('⏳ Waiting for confirmation...', tx.hash);
      const receipt = await tx.wait();
      console.log('✅ Transaction confirmed!', receipt);

      if (offerType === 'BORROW_REQUEST' && collateralDepositId > 0) {
        const offerEvent = receipt.logs.find(log => {
          try {
            const parsed = contracts.lendingPool.interface.parseLog(log);
            return parsed?.name === 'LoanOfferCreated';
          } catch {
            return false;
          }
        });
        
        if (offerEvent) {
          const parsed = contracts.lendingPool.interface.parseLog(offerEvent);
          const offerId = Number(parsed.args.offerId);
          
          const storageKey = 'borrowRequestDeposits';
          const existing = JSON.parse(localStorage.getItem(storageKey) || '{}');
          existing[offerId] = collateralDepositId;
          localStorage.setItem(storageKey, JSON.stringify(existing));
          
          console.log(`✅ Stored deposit ID ${collateralDepositId} for offer ${offerId}`);
        }
      }

      onSuccess();
      setLoading(false);
    } catch (err) {
      console.error('❌ Error creating offer:', err);
      setError(parseContractError(err, contracts?.lendingPool, 'Failed to create offer.'));
      setLoading(false);
    }
  };

  const isLenderOffer = offerType === 'LENDER_OFFER';

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

        {!isLenderOffer && (
          <>
          
            
            <Select
              label="Token You Want to Borrow"
              value={selectedBorrowToken}
              onChange={(e) => setSelectedBorrowToken(e.target.value)}
              options={[
                { value: 'WETH', label: 'WETH (Wrapped ETH)' },
                { value: 'USDC', label: 'USDC (USD Coin)' },
                { value: 'WBTC', label: 'WBTC (Wrapped Bitcoin)' },
              ]}
              required
            />
          </>
        )}

        <Input
          label={`Principal Amount (in ${isLenderOffer ? 'WETH' : selectedBorrowToken})`}
          type="number"
          step="0.01"
          value={formData.principalAmount}
          onChange={(e) => setFormData({ ...formData, principalAmount: e.target.value })}
          placeholder="0.00"
          required
        />

        <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
          <label className="block text-sm font-semibold text-purple-900 mb-2">
            🔒 Collateral Requirements (Minimum 120%)
          </label>
          
          {!isLenderOffer && (
            <Select
              label="Token to Use as Collateral"
              value={selectedCollateralToken}
              onChange={(e) => setSelectedCollateralToken(e.target.value)}
              options={[
                { value: 'WETH', label: 'WETH (Wrapped ETH)' },
                { value: 'USDC', label: 'USDC (USD Coin)' },
                { value: 'WBTC', label: 'WBTC (Wrapped Bitcoin)' },
              ]}
              required
            />
          )}

          <Input
            label="Collateral Ratio (%)"
            type="number"
            value={formData.collateralRatio}
            onChange={(e) => setFormData({ ...formData, collateralRatio: e.target.value })}
            placeholder="150"
            required
          />

          {!isLenderOffer && formData.collateralAmount && (
            <div className="mt-2 p-3 bg-white rounded border border-purple-300">
              <div className="text-sm text-purple-700">
                Required Collateral: <span className="font-bold">{formData.collateralAmount} {selectedCollateralToken}</span>
              </div>
              <div className="text-xs text-purple-600 mt-1">
                Based on ${TOKEN_PRICES[selectedBorrowToken]} {selectedBorrowToken} and ${TOKEN_PRICES[selectedCollateralToken]} {selectedCollateralToken}
              </div>
            </div>
          )}
        </div>

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

        {isLenderOffer && (
          <Input
            label="Minimum Borrower Reputation"
            type="number"
            value={formData.minReputation}
            onChange={(e) => setFormData({ ...formData, minReputation: e.target.value })}
            placeholder="100"
            helperText="Borrowers below this score cannot accept your offer."
          />
        )}

        {formData.principalAmount && (
          <Card className="bg-blue-50 border-2 border-blue-200">
            <div className="text-sm">
              <div className="font-bold mb-2">
                {isLenderOffer ? 'Lender Offer Summary:' : 'Borrow Request Summary:'}
              </div>
              {isLenderOffer ? (
                <>
                  <div>• You lend: {formData.principalAmount} WETH</div>
                  <div>• Borrower must provide: {formData.collateralRatio}% collateral in any supported token</div>
                  <div>• You receive back: {(parseFloat(formData.principalAmount) * (1 + parseFloat(formData.interestRate) / 100)).toFixed(4)} WETH</div>
                </>
              ) : (
                <>
                  <div>• You borrow: {formData.principalAmount} {selectedBorrowToken}</div>
                  <div>• You lock: {formData.collateralAmount} {selectedCollateralToken} as collateral</div>
                  <div>• You repay: {(parseFloat(formData.principalAmount) * (1 + parseFloat(formData.interestRate) / 100)).toFixed(4)} {selectedBorrowToken}</div>
                </>
              )}
            </div>
          </Card>
        )}

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

const AcceptOfferModal = ({ isOpen, onClose, offer, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCollateralToken, setSelectedCollateralToken] = useState('USDC');
  const [calculatedCollateral, setCalculatedCollateral] = useState('0');

  const isLenderOffer = offer?.offerType === 'LENDER_OFFER';
  const needsCollateral = isLenderOffer && parseFloat(offer?.terms?.collateralRatio?.replace('%', '') || 0) > 0;

  useEffect(() => {
    if (isLenderOffer && offer) {
      const borrowTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
      const collateralRatio = parseFloat(offer.terms.collateralRatio.replace('%', ''));
      
      const collateral = calculateCollateralInToken(
        offer.terms.principalAmount,
        borrowTokenSymbol,
        selectedCollateralToken,
        collateralRatio
      );
      
      setCalculatedCollateral(collateral);
    }
  }, [selectedCollateralToken, offer, isLenderOffer]);

  if (!offer) return null;

  const handleAccept = async () => {
    setLoading(true);
    setError('');

    try {
      if (!contracts.lendingPool || !contracts.collateralManager) {
        throw new Error('Contracts not initialized. Please connect your wallet.');
      }

      console.log('📝 Accepting offer:', offer.offerId);

      if (isLenderOffer) {
        console.log('💼 Borrower accepting lender offer');

        let depositId = 0;

        if (needsCollateral) {
          const collateralTokenAddress = TOKEN_ADDRESSES[selectedCollateralToken];
          const collateralAmount = parseTokenAmount(calculatedCollateral, selectedCollateralToken);

          console.log('   💰 Approving collateral token...');
          const tokenContract = new ethers.Contract(
            collateralTokenAddress,
            ['function approve(address spender, uint256 amount) returns (bool)'],
            contracts.collateralManager.runner
          );

          const approveTx = await tokenContract.approve(
            await contracts.collateralManager.getAddress(),
            collateralAmount
          );
          await approveTx.wait();
          console.log('   ✅ Collateral approved');

          console.log('   🔢 Reading nextLoanId to predict loanId...');
          const predictedLoanId = await contracts.lendingPool.nextLoanId();
          console.log('   📋 Predicted loanId:', predictedLoanId.toString());

          console.log('   🔒 Depositing collateral...');
          
          const nextDepositId = await contracts.collateralManager.nextDepositId();
          depositId = Number(nextDepositId);
          console.log('   📋 Predicted Deposit ID:', depositId);

          const depositTx = await contracts.collateralManager.depositCollateral(
            predictedLoanId,
            collateralTokenAddress,
            collateralAmount
          );

          await depositTx.wait();
          console.log('   ✅ Collateral deposited with ID:', depositId);
        }

        console.log('📤 Accepting loan offer with deposit ID:', depositId);
        console.log('   depositId type:', typeof depositId);
        console.log('   📤 Accepting loan offer with deposit ID:', depositId);
        const tx = await contracts.lendingPool.acceptLoanOffer(
          offer.offerId,
          depositId
        );

        

        console.log('⏳ Waiting for confirmation...', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Loan accepted!', receipt);
      } else {
        console.log('💰 Lender accepting borrow request');

        const borrowTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
        
        const principalAmountStr = String(offer.terms.principalAmount).trim().split(' ')[0];
        const principalAmount = parseTokenAmount(principalAmountStr, borrowTokenSymbol);
        const tokenAddress = offer.terms.tokenAddress;

        let borrowerDepositId = 0;
        const rawCollateralAmount = offer.terms.collateralAmount;
        const hasCollateral = rawCollateralAmount && rawCollateralAmount !== '0' && parseFloat(String(rawCollateralAmount).split(' ')[0]) > 0;

        if (hasCollateral) {
          console.log('Finding borrower collateral deposit...');

          try {
            const collateralTokenSymbol = getTokenSymbol(offer.terms.collateralToken);
            const collateralAmountStr = String(offer.terms.collateralAmount).trim().split(' ')[0];
            const expectedRawAmount = ethers.parseEther(collateralAmountStr);

            const deposits = await contracts.collateralManager.getUserDeposits(offer.creator);
            const sortedDeposits = [...deposits].sort((a, b) => Number(b.depositId) - Number(a.depositId));

            const matchingDeposit = sortedDeposits.find(d =>
              d.tokenAddress.toLowerCase() === offer.terms.collateralToken.toLowerCase() &&
              !d.isLocked &&
              BigInt(d.amount) >= BigInt(expectedRawAmount)
            );

            if (matchingDeposit) {
              borrowerDepositId = Number(matchingDeposit.depositId);
              console.log('   Found borrower deposit ID:', borrowerDepositId);
            } else {
              const collateralTokenSymbolStr = collateralTokenSymbol || 'tokens';
              throw new Error(
                `Borrower has not deposited sufficient collateral. ` +
                `Required: ${offer.terms.collateralAmount} ${collateralTokenSymbolStr}. ` +
                `The borrower may need to re-deposit collateral and recreate their request.`
              );
            }
          } catch (depositError) {
            throw new Error(
              depositError.message ||
              'Could not verify borrower collateral deposit. Please try again.'
            );
          }
        }

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
          borrowerDepositId
        );

        console.log('⏳ Waiting for confirmation...', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Loan accepted!', receipt);
      }

      onSuccess();
      setLoading(false);
    } catch (err) {
      console.error('Error accepting offer:', err);
      setError(parseContractError(err, contracts?.lendingPool, 'Failed to accept offer.'));
      setLoading(false);
    }
  };

  const borrowTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
  const offerCollateralTokenSymbol = getTokenSymbol(offer.terms.collateralToken || ethers.ZeroAddress);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Accept Loan Offer" size="md">
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        <Alert variant="info">
          {isLenderOffer 
            ? `You are accepting this loan as a BORROWER. You will receive ${offer.terms.principalAmount} ${borrowTokenSymbol}.`
            : `You are accepting this loan as a LENDER. You will provide ${offer.terms.principalAmount} ${borrowTokenSymbol}.`
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
              <span className="text-gray-600">Borrow Amount</span>
              <span className="font-semibold">{offer.terms.principalAmount} {borrowTokenSymbol}</span>
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
              <span className="font-semibold text-purple-600">{offer.terms.collateralRatio}</span>
            </div>
          </div>
        </Card>

        {isLenderOffer && needsCollateral && (
          <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
            <label className="block text-sm font-semibold text-purple-900 mb-2">
              🔒 Choose Your Collateral Token
            </label>
            
            <Select
              label="Collateral Token"
              value={selectedCollateralToken}
              onChange={(e) => setSelectedCollateralToken(e.target.value)}
              options={[
                { value: 'WETH', label: 'WETH (Wrapped ETH)' },
                { value: 'USDC', label: 'USDC (USD Coin)' },
                { value: 'WBTC', label: 'WBTC (Wrapped Bitcoin)' },
              ]}
              required
            />

            <div className="mt-2 p-3 bg-white rounded border border-purple-300">
              <div className="text-sm text-purple-700">
                Required Collateral: <span className="font-bold">{calculatedCollateral} {selectedCollateralToken}</span>
              </div>
              <div className="text-xs text-purple-600 mt-1">
                Based on ${TOKEN_PRICES[borrowTokenSymbol]} {borrowTokenSymbol} and ${TOKEN_PRICES[selectedCollateralToken]} {selectedCollateralToken}
              </div>
            </div>

            <Alert variant="info" className="mt-3">
              ✅ Collateral will be automatically deposited and locked when you accept this offer.
            </Alert>
          </div>
        )}

        {!isLenderOffer && (
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-sm text-purple-700">
              Borrower's Collateral: <span className="font-bold">{formatTokenAmount(offer.terms.collateralAmount, offerCollateralTokenSymbol || 'WETH')} {offerCollateralTokenSymbol}</span>
            </div>
          </div>
        )}

        <Card className="bg-blue-50 border-2 border-blue-200">
          <div className="space-y-2">
            <p className="font-semibold text-blue-900">What happens next:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              {isLenderOffer ? (
                <>
                  <li>You'll receive {offer.terms.principalAmount} {borrowTokenSymbol} (minus 1% platform fee)</li>
                  <li>Your {calculatedCollateral} {selectedCollateralToken} collateral will be locked</li>
                  <li>You must repay {offer.terms.principalAmount} {borrowTokenSymbol} + {offer.terms.interestRate} interest</li>
                  <li>After repayment, your {selectedCollateralToken} collateral will be returned</li>
                </>
              ) : (
                <>
                  <li>You'll provide {offer.terms.principalAmount} {borrowTokenSymbol} to the borrower</li>
                  <li>Borrower's {formatTokenAmount(offer.terms.collateralAmount, offerCollateralTokenSymbol || 'WETH')} {offerCollateralTokenSymbol} will be locked as security</li>
                  <li>You'll receive principal + {offer.terms.interestRate} interest when repaid</li>
                  <li>If borrower defaults, you can liquidate their {offerCollateralTokenSymbol} collateral</li>
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