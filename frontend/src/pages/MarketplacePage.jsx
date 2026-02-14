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
// CRITICAL: Handle very small decimals and prevent precision errors
const parseTokenAmount = (amount, tokenSymbol) => {
  const info = getTokenInfo(tokenSymbol);
  
  try {
    // Convert string to number first to handle scientific notation
    let numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    // Handle zero or invalid amounts
    if (numAmount === 0 || isNaN(numAmount) || numAmount < 0) {
      return BigInt(0);
    }
    
    // Round to token's decimal precision to prevent "too many decimals" errors
    const multiplier = Math.pow(10, info.decimals);
    numAmount = Math.round(numAmount * multiplier) / multiplier;
    
    // Convert back to string with proper precision
    const amountStr = numAmount.toFixed(info.decimals);
    
    // Additional validation - check if the resulting string is valid
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
    return ethers.parseEther(amountStr); // fallback
  } catch (error) {
    console.error('❌ Error parsing token amount:', { amount, tokenSymbol, error });
    return BigInt(0);
  }
};

// ✅ Format token amount to readable string with decimals
// CRITICAL: Backend uses formatEther (18 decimals) for ALL tokens
// We need to convert back to raw amount, then re-format with correct decimals
const formatTokenAmount = (amount, tokenSymbol) => {
  if (!amount || amount === '0' || amount === 0) return '0.0000';
  
  const info = getTokenInfo(tokenSymbol);
  
  try {
    // Backend formatted with 18 decimals (formatEther), but actual token may have different decimals
    // Example: 45000 USDC stored as "0.000000045" (45000000000 wei / 10^18)
    // We need: parseEther("0.000000045") = 45000000000 raw, then format with USDC decimals (6)
    
    // Convert number to string if needed
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;
    
    if (typeof amountStr === 'string' && !amountStr.startsWith('0x')) {
      // Step 1: Parse as 18-decimal number to get raw BigInt amount
      const rawAmount = ethers.parseEther(amountStr);
      
      // Step 2: Format with actual token's decimals
      const formatted = ethers.formatUnits(rawAmount, info.decimals);
      return parseFloat(formatted).toFixed(4);
    }
    
    // If it's already a BigInt or hex string from contract
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
  
  // Calculate USD value of principal
  const principalValueUSD = parseFloat(principalAmount) * principalInfo.price;
  
  // Calculate required USD value of collateral (collateralRatio is %, e.g., 150 means 150%)
  const requiredCollateralUSD = principalValueUSD * (parseFloat(collateralRatio) / 100);
  
  // Convert to collateral token amount
  const collateralAmount = requiredCollateralUSD / collateralInfo.price;
  
  return collateralAmount.toFixed(4);
};

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

  // ✅ NEW: Cancel offer handler
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
      alert('Failed to cancel offer: ' + err.message);
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
              onCancel={handleCancelOffer} // ✅ Pass cancel handler
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

// ✅ Token helper functions - Fixed to handle case-insensitive address matching
const getTokenSymbol = (address) => {
  if (!address || address === ethers.ZeroAddress) return null; // ✅ Return null for unset tokens
  const lowerAddress = address.toLowerCase();
  
  // Match against known token addresses
  for (const [symbol, addr] of Object.entries(TOKEN_ADDRESSES)) {
    if (addr.toLowerCase() === lowerAddress) {
      return symbol;
    }
  }
  
  return 'Unknown';
};

// ✅ FIXED: OfferCard now shows Cancel button for own offers
const OfferCard = ({ offer, onAccept, onCancel, currentAccount }) => {
  const isLenderOffer = offer.offerType === 'LENDER_OFFER';
  const isOwnOffer = offer.creator.toLowerCase() === currentAccount?.toLowerCase();

  const loanTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
  const collateralTokenSymbol = getTokenSymbol(offer.terms.collateralToken);

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

        {/* ✅ Show collateral info based on offer type */}
        {isLenderOffer ? (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-xs text-blue-600 mb-1">Collateral Requirement</div>
            <div className="text-lg font-bold text-blue-900">
              {offer.terms.collateralRatio}
            </div>
            <div className="text-xs text-blue-600 mt-1">
              Borrower chooses collateral token
            </div>
          </div>
        ) : (
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-xs text-purple-600 mb-1">Collateral Offered</div>
            <div className="text-lg font-bold text-purple-900">
              {formatTokenAmount(offer.terms.collateralAmount, collateralTokenSymbol || 'WETH')} {collateralTokenSymbol || 'TBD'}
            </div>
            <div className="text-xs text-purple-600 mt-1">
              {offer.terms.collateralRatio} ratio
            </div>
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
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Min. Reputation</span>
          <span className="font-medium">{offer.terms.minReputation}</span>
        </div>
      </div>

      {/* ✅ FIXED: Show Cancel button for own offers, Accept button for others */}
      {isOwnOffer ? (
        <Button 
          variant="danger" 
          onClick={() => onCancel(offer)}
          className="w-full"
        >
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

// ✅ FIXED: CreateOfferModal - Token selector only for BORROW_REQUEST
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

  // ✅ Auto-calculate collateral amount with price consideration
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

      // ✅ For LENDER_OFFER: collateral is TBD (borrower chooses)
      // ✅ For BORROW_REQUEST: use selected collateral token
      const collateralTokenAddress = isLenderOffer 
        ? ethers.ZeroAddress 
        : TOKEN_ADDRESSES[selectedCollateralToken];
      
      const collateralAmount = isLenderOffer
        ? ethers.parseEther('0')
        : parseTokenAmount(formData.collateralAmount, selectedCollateralToken);

      // Validation: for BORROW_REQUEST, tokens must be different
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
        minReputation: parseInt(formData.minReputation),
        collateralRatio: Math.floor(parseFloat(formData.collateralRatio) * 100),
      };

      const offerTypeValue = offerType === 'LENDER_OFFER' ? 0 : 1;

      console.log('📝 Creating loan offer:', { offerTypeValue, loanTerms });

      // ============ LENDER_OFFER: Approve and lock principal ============
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

      // ============ BORROW_REQUEST: Approve and deposit collateral FIRST ============
      let collateralDepositId = 0;
      if (offerType === 'BORROW_REQUEST' && collateralAmount > 0n) {
        console.log('🔒 BORROWER: Depositing collateral before creating request...');
        console.log('   Collateral amount:', ethers.formatUnits(collateralAmount, TOKEN_INFO[selectedCollateralToken].decimals), selectedCollateralToken);
        
        // Step 1: Approve collateral token
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
        
        // Step 2: Deposit collateral.
        // CRITICAL: isCollateralSufficient(depositId, ...) in the contract treats depositId
        // as a loanId and looks up loanToDepositIds[depositId]. For this lookup to find the
        // deposit, the deposit must have been created with loanId = its own depositId.
        // We achieve this by reading nextDepositId before depositing and using it as loanId.
        console.log('   Reading nextDepositId to self-reference deposit...');
        const predictedDepositId = await contracts.collateralManager.nextDepositId();
        console.log('   Predicted depositId:', predictedDepositId.toString());

        console.log('   Depositing collateral...');
        const depositTx = await contracts.collateralManager.depositCollateral(
          predictedDepositId, // loanId = own depositId so isCollateralSufficient can find it
          collateralTokenAddress,
          collateralAmount
        );
        const depositReceipt = await depositTx.wait();
        
        // Extract depositId from event logs or query
        console.log('   📋 Extracting collateral deposit ID...');
        console.log('   Total logs:', depositReceipt.logs.length);
        let foundDepositId = false;
        
        const collateralManagerAddress = (await contracts.collateralManager.getAddress()).toLowerCase();
        console.log('   CollateralManager address:', collateralManagerAddress);
        
        // Try multiple methods to get the deposit ID
        
        // Method 1: Parse events from receipt
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
                // Continue to next log
                console.log('   ⚠️  Could not parse log:', e.message);
              }
            }
          }
        } catch (eventParseError) {
          console.log('   ⚠️  Event parsing failed:', eventParseError.message);
        }
        
        // Method 2: Query user deposits and find the most recent one
        if (!foundDepositId) {
          console.log('   🔄 Method 2: Querying user deposits...');
          try {
            // Wait a moment for the deposit to be indexed
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const userDeposits = await contracts.collateralManager.getUserDeposits(account);
            console.log('   Total deposits found:', userDeposits.length);
            
            if (userDeposits.length > 0) {
              // Find the most recent deposit matching the token
              // Sort by depositId descending to get most recent first
              const sortedDeposits = [...userDeposits].sort((a, b) => 
                Number(b.depositId) - Number(a.depositId)
              );
              
              // First try: exact match (same token, unlocked, amount matches)
              let matchingDeposit = sortedDeposits.find(d => {
                const matches = 
                  d.tokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase() &&
                  !d.isLocked &&
                  BigInt(d.amount) === collateralAmount;
                
                if (matches) {
                  console.log('   Found exact matching deposit:', {
                    id: d.depositId.toString(),
                    token: d.tokenAddress,
                    amount: d.amount.toString(),
                    locked: d.isLocked
                  });
                }
                return matches;
              });
              
              // Second try: most recent deposit with same token that's unlocked
              if (!matchingDeposit) {
                console.log('   No exact match, trying recent unlocked deposit...');
                matchingDeposit = sortedDeposits.find(d => 
                  d.tokenAddress.toLowerCase() === collateralTokenAddress.toLowerCase() &&
                  !d.isLocked
                );
                
                if (matchingDeposit) {
                  console.log('   Using most recent unlocked deposit:', {
                    id: matchingDeposit.depositId.toString(),
                    amount: matchingDeposit.amount.toString()
                  });
                }
              }
              
              if (matchingDeposit) {
                collateralDepositId = Number(matchingDeposit.depositId);
                console.log('   ✅ Method 2: Found depositId via query:', collateralDepositId);
                foundDepositId = true;
              } else {
                console.log('   ❌ No unlocked deposits found for this token');
              }
            } else {
              console.log('   ❌ No deposits found for this user');
            }
          } catch (queryErr) {
            console.error('   ❌ Query failed:', queryErr.message);
          }
        }
        
        if (!foundDepositId || collateralDepositId === 0) {
          const errorMsg = 'Could not extract collateral deposit ID. The deposit was successful, but the ID could not be retrieved automatically. Please check the Collateral page to see your deposit ID.';
          console.error('   ❌', errorMsg);
          throw new Error(errorMsg);
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

      // ✅ Store deposit ID in localStorage for borrow requests
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
          
          // Store mapping of offerId -> depositId in localStorage
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
      setError(err.message || 'Failed to create offer');
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

        {/* ✅ FIXED: Token selector ONLY shown for BORROW_REQUEST */}
        {!isLenderOffer && (
          <>
            <Alert variant="info">
              As a borrower, you choose what token to borrow and what token to use as collateral.
            </Alert>
            
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

        {/* For LENDER_OFFER, show info about what they're lending */}
        {isLenderOffer && (
          <Alert variant="info">
            You are offering to lend WETH. Borrowers will choose their collateral token when accepting.
          </Alert>
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

        {/* ✅ Collateral section - different for LENDER vs BORROWER */}
        <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
          <label className="block text-sm font-semibold text-purple-900 mb-2">
            🔒 Collateral Requirements
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

        <Input
          label="Minimum Reputation"
          type="number"
          value={formData.minReputation}
          onChange={(e) => setFormData({ ...formData, minReputation: e.target.value })}
          placeholder="100"
          required
        />

        {/* Summary card */}
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

// ✅ FIXED: AcceptOfferModal - Automatically deposits collateral when accepting lender offer
const AcceptOfferModal = ({ isOpen, onClose, offer, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCollateralToken, setSelectedCollateralToken] = useState('USDC');
  const [calculatedCollateral, setCalculatedCollateral] = useState('0');

  // ✅ FIX #3: Calculate offer properties at top level (before any conditional returns)
  const isLenderOffer = offer?.offerType === 'LENDER_OFFER';
  const needsCollateral = isLenderOffer && parseFloat(offer?.terms?.collateralRatio?.replace('%', '') || 0) > 0;

  // ✅ FIX #3: Move useEffect BEFORE any conditional returns to maintain hook order
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

  // ✅ Conditional return AFTER all hooks
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
        // ============ BORROWER ACCEPTING LENDER OFFER ============
        console.log('💼 Borrower accepting lender offer');
        console.log('   Collateral Token:', selectedCollateralToken);
        console.log('   Collateral Amount:', calculatedCollateral);

        let depositId = 0;

        if (needsCollateral) {
          // Step 1: Approve collateral token
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

          // Step 2: Deposit collateral
          // Step 2: Deposit collateral using the predicted loanId.
          // lockCollateral() checks deposit.loanId === nextLoanId, so we must
          // read nextLoanId *before* we call acceptLoanOffer (which increments it).
          console.log('   🔢 Reading nextLoanId to predict loanId...');
          const predictedLoanId = await contracts.lendingPool.nextLoanId();
          console.log('   📋 Predicted loanId:', predictedLoanId.toString());

          console.log('   🔒 Depositing collateral...');
          const depositTx = await contracts.collateralManager.depositCollateral(
            predictedLoanId,
            collateralTokenAddress,
            collateralAmount
          );

          const depositReceipt = await depositTx.wait();
          console.log('   ✅ Collateral deposited');

          // Extract depositId from event logs
          const event = depositReceipt.logs.find(log => {
            try {
              const parsed = contracts.collateralManager.interface.parseLog(log);
              return parsed?.name === 'CollateralDeposited';
            } catch {
              return false;
            }
          });

          if (event) {
            const parsed = contracts.collateralManager.interface.parseLog(event);
            depositId = Number(parsed.args.depositId);
            console.log('   📋 Deposit ID:', depositId);
          }
        }

        // Step 3: Accept the loan offer
        console.log('   📤 Accepting loan offer with deposit ID:', depositId);
        const tx = await contracts.lendingPool.acceptLoanOffer(
          offer.offerId,
          depositId
        );

        console.log('⏳ Waiting for confirmation...', tx.hash);
        const receipt = await tx.wait();
        console.log('✅ Loan accepted!', receipt);
      } else {
        // ============ LENDER ACCEPTING BORROW REQUEST ============
        console.log('💰 Lender accepting borrow request');

        const borrowTokenSymbol = getTokenSymbol(offer.terms.tokenAddress);
        
        // ✅ FIX: Strip token symbol from formatted string before parsing
        const principalAmountStr = String(offer.terms.principalAmount).trim().split(' ')[0];
        const principalAmount = parseTokenAmount(principalAmountStr, borrowTokenSymbol);
        const tokenAddress = offer.terms.tokenAddress;

        // ✅ CRITICAL FIX: Lender must pass the borrower's actual depositId
        // The contract needs to verify and lock the borrower's pre-deposited collateral
        let borrowerDepositId = 0;
        const rawCollateralAmount = offer.terms.collateralAmount;
        const hasCollateral = rawCollateralAmount && rawCollateralAmount !== '0' && parseFloat(String(rawCollateralAmount).split(' ')[0]) > 0;

        if (hasCollateral) {
          console.log('Finding borrower collateral deposit...');
          console.log('   Borrower:', offer.creator);
          console.log('   Offer collateralAmount (backend-formatted):', offer.terms.collateralAmount);
          console.log('   Offer collateralToken:', offer.terms.collateralToken);

          try {
            const collateralTokenSymbol = getTokenSymbol(offer.terms.collateralToken);

            // ─────────────────────────────────────────────────────────────────
            // KEY FIX: The backend formats ALL token amounts with formatEther
            // (18 decimals) regardless of actual token decimals.
            // e.g. 22410 raw USDC (6 dec) -> "0.00000002241" (divided by 10^18)
            //
            // To recover the raw on-chain amount we REVERSE that with parseEther.
            // We must NOT use parseTokenAmount here — it applies the token's own
            // decimals (6 for USDC) which causes the tiny number to round to 0.
            // ─────────────────────────────────────────────────────────────────
            const collateralAmountStr = String(offer.terms.collateralAmount).trim().split(' ')[0];
            const expectedRawAmount = ethers.parseEther(collateralAmountStr);
            console.log('   Expected raw amount:', expectedRawAmount.toString());

            const deposits = await contracts.collateralManager.getUserDeposits(offer.creator);
            console.log('   Found', deposits.length, 'total deposits for borrower');
            deposits.forEach((d, i) => {
              const decimals = TOKEN_INFO[collateralTokenSymbol]?.decimals || 18;
              console.log(`   deposit[${i}]: id=${d.depositId} amount=${d.amount} (${ethers.formatUnits(d.amount, decimals)} ${collateralTokenSymbol}) locked=${d.isLocked} token=${d.tokenAddress}`);
            });

            // Sort descending by depositId — prefer most recent deposit
            const sortedDeposits = [...deposits].sort((a, b) => Number(b.depositId) - Number(a.depositId));

            // Compare raw on-chain BigInt amounts — no decimal conversion
            const matchingDeposit = sortedDeposits.find(d =>
              d.tokenAddress.toLowerCase() === offer.terms.collateralToken.toLowerCase() &&
              !d.isLocked &&
              BigInt(d.amount) >= BigInt(expectedRawAmount)
            );

            if (matchingDeposit) {
              borrowerDepositId = Number(matchingDeposit.depositId);
              const decimals = TOKEN_INFO[collateralTokenSymbol]?.decimals || 18;
              console.log('   Found borrower deposit ID:', borrowerDepositId);
              console.log('      Amount:', ethers.formatUnits(matchingDeposit.amount, decimals), collateralTokenSymbol);
            } else {
              console.warn('   No matching deposit found. Deposit check details:');
              sortedDeposits.forEach(d => {
                const tokenMatch = d.tokenAddress.toLowerCase() === offer.terms.collateralToken.toLowerCase();
                const amountMatch = BigInt(d.amount) >= BigInt(expectedRawAmount);
                console.warn(`      id=${d.depositId} tokenMatch=${tokenMatch} amountOk=${amountMatch} locked=${d.isLocked}`);
              });
              throw new Error(
                `Borrower has not deposited sufficient collateral. ` +
                `Required: ${offer.terms.collateralAmount} ${collateralTokenSymbol}. ` +
                `The borrower may need to re-deposit collateral and recreate their request.`
              );
            }
          } catch (depositError) {
            console.error('   Error finding collateral deposit:', depositError);
            throw new Error(
              depositError.message ||
              'Could not verify borrower collateral deposit. Please try again.'
            );
          }
        }

        console.log('   Approving', offer.terms.principalAmount, borrowTokenSymbol, '...');

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

        console.log('   Accepting offer with borrower\'s depositId:', borrowerDepositId);
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

        {/* ✅ NEW: Token selector for borrowers accepting lender offers */}
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

        {/* Show collateral info for borrow requests */}
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