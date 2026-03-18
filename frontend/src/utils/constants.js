// Application constants, contract addresses, and ABIs

// ============ Network Configuration ============
export const NETWORK_CONFIG = {
  sepolia: {
    chainId: "0xaa36a7", // 11155111 in hex
    chainName: "Sepolia Testnet",
    nativeCurrency: {
      name: "Sepolia ETH",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: [import.meta.env.VITE_RPC_URL || "https://sepolia.infura.io/v3/"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  localhost: {
    chainId: "0x7a69", // 31337 in hex
    chainName: "Hardhat-Local",
    nativeCurrency: {
      name: "ETH",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: ["http://127.0.0.1:8545"],
    blockExplorerUrls: [""],
  },
};

// ============ Contract Addresses ============
export const CONTRACT_ADDRESSES = {
  reputationManager: import.meta.env.VITE_REPUTATION_MANAGER,
  priceOracle: import.meta.env.VITE_PRICE_ORACLE,
  collateralManager: import.meta.env.VITE_COLLATERAL_MANAGER,
  lendingPool: import.meta.env.VITE_LENDING_POOL,
  lendingPoolLens: import.meta.env.VITE_LENDING_POOL_LENS,
  coSigningManager: import.meta.env.VITE_COSIGNING_MANAGER,
};

// ============ Token Addresses ============
export const TOKEN_ADDRESSES = {
  WETH: "0x5FbDB2315678afecb367f032d93F642f64180aa3", //Sepolia: 0xE2b5bDE7e80f89975f7229d78aD9259b2723d11F
  USDC: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", //Sepolia: 0xC6c5Ab5039373b0CBa7d0116d9ba7fb9831C3f42
  WBTC: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", //Sepolia: 0x4ea0Be853219be8C9cE27200Bdeee36881612FF2
};

// ============ API Configuration ============
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

export const API_ENDPOINTS = {
  // Reputation
  reputation: (address) => `/api/reputation/${address}`,
  initializeReputation: "/api/reputation/initialize",

  // Loans
  lenderOffers: "/api/loans/offers/lenders",
  borrowerRequests: "/api/loans/offers/borrowers",
  userLoans: (address) => `/api/loans/user/${address}`,
  loanDetails: (loanId) => `/api/loans/${loanId}`,

  // Collateral
  collateralTokens: "/api/collateral/tokens",
  userCollateral: (address) => `/api/collateral/user/${address}`,
  loanCollateralValue: (loanId) => `/api/collateral/loan/${loanId}/value`,

  // Co-signing
  coSigningRequests: "/api/cosigning/requests",
  userCoSignings: (address) => `/api/cosigning/user/${address}`,

  // Prices
  prices: "/api/prices",
  tokenPrice: (address) => `/api/prices/${address}`,

  // Stats
  platformStats: "/api/stats/platform",

  // Health
  health: "/health",
};

// ============ Loan Status ============
export const LOAN_STATUS = {
  PENDING: 0,
  ACTIVE: 1,
  REPAID: 2,
  DEFAULTED: 3,
  CANCELLED: 4,
};

export const LOAN_STATUS_LABELS = {
  0: "Pending",
  1: "Active",
  2: "Repaid",
  3: "Defaulted",
  4: "Cancelled",
};

export const LOAN_STATUS_COLORS = {
  0: "yellow",
  1: "blue",
  2: "green",
  3: "red",
  4: "gray",
};

// ============ Loan Types ============
export const LOAN_TYPE = {
  LENDER_OFFER: 0,
  BORROW_REQUEST: 1,
};

export const LOAN_TYPE_LABELS = {
  0: "Lender Offer",
  1: "Borrow Request",
};

// ============ Reputation Thresholds ============
export const REPUTATION_LEVELS = {
  POOR: { min: 0, max: 200, label: "Poor", color: "red" },
  FAIR: { min: 200, max: 400, label: "Fair", color: "orange" },
  GOOD: { min: 400, max: 600, label: "Good", color: "yellow" },
  VERY_GOOD: { min: 600, max: 800, label: "Very Good", color: "blue" },
  EXCELLENT: { min: 800, max: 1000, label: "Excellent", color: "green" },
};

export const getReputationLevel = (score) => {
  const numScore = Number(score);
  if (numScore < 200) return REPUTATION_LEVELS.POOR;
  if (numScore < 400) return REPUTATION_LEVELS.FAIR;
  if (numScore < 600) return REPUTATION_LEVELS.GOOD;
  if (numScore < 800) return REPUTATION_LEVELS.VERY_GOOD;
  return REPUTATION_LEVELS.EXCELLENT;
};

// ============ Platform Constants ============
export const PLATFORM_CONSTANTS = {
  MIN_LOAN_DURATION: 1, // days
  MAX_LOAN_DURATION: 365, // days
  MAX_INTEREST_RATE: 50, // percent
  BASIS_POINTS: 10000,
  MIN_COLLATERAL_RATIO: 120, // percent
  LIQUIDATION_THRESHOLD: 110, // percent
};

// ============ Token Decimals ============
export const TOKEN_DECIMALS = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WBTC: 8,
};

// ============ Navigation Links ============
export const NAV_LINKS = [
  { name: "Home", path: "/", icon: "home" },
  { name: "Dashboard", path: "/dashboard", icon: "dashboard" },
  { name: "Marketplace", path: "/marketplace", icon: "market" },
  { name: "My Loans", path: "/my-loans", icon: "loans" },
  { name: "Reputation", path: "/reputation", icon: "star" },
  { name: "Co-signing", path: "/cosigning", icon: "users" },
];

// ============ Contract ABIs (Minimal - only functions we need) ============

// ReputationManager ABI
export const REPUTATION_MANAGER_ABI = [
  "function getReputationScore(address user) view returns (uint256)",
  "function getReputationData(address user) view returns (tuple(uint256 baseScore, uint256 totalTransactions, uint256 uniqueCounterparties, uint256 totalValueTransferred, uint256 successfulRepayments, uint256 totalRepaymentValue, uint256 defaults, uint256 totalDefaultValue, uint256 walletCreationTime, uint256 lastActivityTimestamp, uint256 lastReputationUpdate, bool emailVerified, bool phoneVerified, uint256 reputationGainedToday, uint256 lastDailyResetTimestamp))",
  "function initializeReputation(address user)",
  "function meetsReputationRequirement(address user, uint256 minimumReputation) view returns (bool)",
  "function getOfferCoSigningBonus(address borrower, uint256 loanOfferId) view returns (uint256)",
  "function coSigningBonusByOffer(address borrower, uint256 loanOfferId) view returns (uint256)",
  "function getRemainingDailyCap(address user) view returns (uint256)",
  "function touchReputation(address user)",
];

// LendingPool ABI
export const LENDING_POOL_ABI = [
  "function createLoanOffer(uint8 offerType, tuple(address tokenAddress, uint256 principalAmount, uint256 collateralAmount, address collateralToken, uint256 interestRate, uint256 duration, uint256 minReputation, uint256 collateralRatio) terms) returns (uint256)",
  "function cancelLoanOffer(uint256 offerId)",
  "function acceptLoanOffer(uint256 offerId, uint256 collateralDepositId) returns (uint256)",
  "function repayLoan(uint256 loanId, uint256 amount)",
  "function getLoan(uint256 loanId) view returns (tuple(uint256 loanId, uint8 loanType, address lender, address borrower, tuple(address tokenAddress, uint256 principalAmount, uint256 collateralAmount, address collateralToken, uint256 interestRate, uint256 duration, uint256 minReputation, uint256 collateralRatio) terms, uint8 status, uint256 startTime, uint256 dueTime, uint256 amountRepaid, uint256 collateralDepositId, bool hasCoSigner, address coSigner))",
  "function getLoanOffer(uint256 offerId) view returns (tuple(uint256 offerId, uint8 offerType, address creator, tuple(address tokenAddress, uint256 principalAmount, uint256 collateralAmount, address collateralToken, uint256 interestRate, uint256 duration, uint256 minReputation, uint256 collateralRatio) terms, bool isActive, uint256 createdAt))",
  "function calculateAmountDue(uint256 loanId) view returns (uint256)",
  "function isLoanOverdue(uint256 loanId) view returns (bool)",
  "function getActiveLenderOfferIds() view returns (uint256[])",
  "function getActiveBorrowerRequestIds() view returns (uint256[])",
  "function getUserLoans(address user) view returns (uint256[])",
  "function nextLoanId() view returns (uint256)",
  "function nextOfferId() view returns (uint256)",
  "function setCoSigningManager(address _coSigningManager)",
];

// LendingPoolLens ABI
export const LENDING_POOL_LENS_ABI = [
  "function getPlatformStats() view returns (uint256 totalLoans, uint256 totalOffers, uint256 activeLenderOffers, uint256 activeBorrowerRequests, uint256 platformFeeRate)",
  "function getActiveLenderOffers() view returns (uint256[])",
  "function getActiveBorrowerRequests() view returns (uint256[])",
  "function getUserLoans(address user) view returns (uint256[])",
];

// CollateralManager ABI
export const COLLATERAL_MANAGER_ABI = [
  "function depositCollateral(uint256 loanId, address tokenAddress, uint256 amount) returns (uint256)",
  "function withdrawCollateral(uint256 depositId)",
  "function getCollateralDeposit(uint256 depositId) view returns (tuple(uint256 depositId, address depositor, address tokenAddress, uint256 amount, uint256 loanId, bool isLocked, uint256 depositTimestamp, uint256 lockedTimestamp))",
  "function getUserDeposits(address user) view returns (tuple(uint256 depositId, address depositor, address tokenAddress, uint256 amount, uint256 loanId, bool isLocked, uint256 depositTimestamp, uint256 lockedTimestamp)[])",
  "function getLoanCollateral(uint256 loanId) view returns (tuple(uint256 depositId, address depositor, address tokenAddress, uint256 amount, uint256 loanId, bool isLocked, uint256 depositTimestamp, uint256 lockedTimestamp)[])",
  "function getLoanCollateralValue(uint256 loanId) view returns (uint256)",
  "function getSupportedTokens() view returns (address[])",
  "function getTokenInfo(address token) view returns (tuple(bool isSupported, uint256 maxDepositAmount, uint256 liquidationPenalty, uint256 totalDeposited))",
  "function isCollateralSufficient(uint256 loanId, uint256 loanAmount, uint256 requiredRatio) view returns (bool)",
  "function calculateHealthFactor(uint256 loanId, uint256 loanAmount) view returns (uint256)",
  "function nextDepositId() view returns (uint256)",
];

// CoSigningManager ABI
export const COSIGNING_MANAGER_ABI = [
  "function createCoSigningRequest(uint256 loanOfferId, uint256 requestedBonus, string message) returns (uint256)",
  "function cancelCoSigningRequest(uint256 requestId)",
  "function acceptCoSigningRequest(uint256 requestId) returns (uint256)",
  "function getCoSigningRequest(uint256 requestId) view returns (tuple(uint256 requestId, address borrower, uint256 loanOfferId, uint256 requestedBonus, bool isActive, uint256 createdAt, string message))",
  "function getCoSigningRecord(uint256 recordId) view returns (tuple(uint256 recordId, address coSigner, address borrower, uint256 loanId, uint256 reputationStaked, uint256 bonusProvided, uint256 coSignTimestamp, bool isActive, bool loanCompleted, bool borrowerDefaulted))",
  "function getAllOpenRequests() view returns (tuple(uint256 requestId, address borrower, uint256 loanOfferId, uint256 requestedBonus, bool isActive, uint256 createdAt, string message)[])",
  "function getUserCoSignings(address coSigner) view returns (uint256[])",
  "function getCoSigningStats(address user) view returns (uint256 totalCoSignings, uint256 activeCoSignings, uint256 successfulCoSignings, uint256 defaultedCoSignings)",
  "function cancelCoSigningRecord(uint256 recordId)",
  "function getRecordsByOffer(uint256 loanOfferId) view returns (uint256[])",
  "function getCoSigningRecord(uint256 recordId) view returns (tuple(uint256 recordId, address coSigner, address borrower, uint256 loanId, uint256 reputationStaked, uint256 bonusProvided, uint256 coSignTimestamp, bool isActive, bool loanCompleted, bool borrowerDefaulted, bool wasCancelled))",
  "function linkRecordToLoan(uint256 recordId, uint256 loanId)",
  "function getLoanCoSigners(uint256 loanId) view returns (uint256[])",
];

// PriceOracle ABI
export const PRICE_ORACLE_ABI = [
  "function getPrice(address token) view returns (uint256)",
  "function getPriceData(address token) view returns (tuple(uint256 price, uint256 timestamp, uint80 roundId, bool isValid))",
  "function getSupportedTokens() view returns (address[])",
  "function isSupportedToken(address token) view returns (bool)",
];

// ERC20 ABI (for token approvals and transfers)
export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// ============ usePlatformStats Hook (UPDATED) ============
export const usePlatformStats = () => {
  const { contracts } = useWeb3(); // ✅ Use contracts from Web3Context
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // ✅ Try frontend-direct call first (faster)
      if (contracts.lendingPoolLens) {
        console.log("📊 Fetching platform stats from contract...");
        const result = await contracts.lendingPoolLens.getPlatformStats();

        const statsData = {
          totalLoans: result[0].toString(),
          totalOffers: result[1].toString(),
          activeLenderOffers: Number(result[2]),
          activeBorrowerRequests: Number(result[3]),
          platformFeeRate: (Number(result[4]) / 100).toFixed(2) + "%",
        };

        console.log("✅ Platform stats:", statsData);
        setStats(statsData);
      } else {
        // ✅ Fallback to API if contracts not loaded
        console.log("📊 Fetching platform stats from API...");
        const data = await api.getPlatformStats();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch platform stats:", err);
      setError(err.message);

      // ✅ Set default values on error
      setStats({
        totalLoans: "0",
        totalOffers: "0",
        activeLenderOffers: 0,
        activeBorrowerRequests: 0,
        platformFeeRate: "1.00%",
      });
    } finally {
      setLoading(false);
    }
  }, [contracts]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};

// ============ Error Messages ============
export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: "Please connect your wallet first",
  WRONG_NETWORK: "Please switch to Sepolia network",
  INSUFFICIENT_BALANCE: "Insufficient balance",
  TRANSACTION_REJECTED: "Transaction rejected by user",
  UNKNOWN_ERROR: "An unknown error occurred",
  CONTRACT_ERROR: "Contract interaction failed",
  API_ERROR: "Failed to fetch data from backend",
};

// ============ Success Messages ============
export const SUCCESS_MESSAGES = {
  WALLET_CONNECTED: "Wallet connected successfully",
  TRANSACTION_SUBMITTED: "Transaction submitted",
  TRANSACTION_CONFIRMED: "Transaction confirmed",
  LOAN_CREATED: "Loan offer created successfully",
  LOAN_ACCEPTED: "Loan accepted successfully",
  LOAN_REPAID: "Loan repaid successfully",
  COLLATERAL_DEPOSITED: "Collateral deposited successfully",
  COLLATERAL_WITHDRAWN: "Collateral withdrawn successfully",
};

// ============ Default Values ============
export const DEFAULT_VALUES = {
  loanOffer: {
    principalAmount: "",
    interestRate: 10,
    duration: 30,
    minReputation: 100,
    collateralRatio: 150,
  },
};

export default {
  NETWORK_CONFIG,
  CONTRACT_ADDRESSES,
  API_BASE_URL,
  API_ENDPOINTS,
  LOAN_STATUS,
  LOAN_STATUS_LABELS,
  LOAN_STATUS_COLORS,
  LOAN_TYPE,
  LOAN_TYPE_LABELS,
  REPUTATION_LEVELS,
  getReputationLevel,
  PLATFORM_CONSTANTS,
  TOKEN_DECIMALS,
  NAV_LINKS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  DEFAULT_VALUES,
};
