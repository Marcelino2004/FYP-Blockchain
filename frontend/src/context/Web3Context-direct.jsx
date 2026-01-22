// frontend/src/context/Web3Context.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  NETWORK_CONFIG,
  REPUTATION_MANAGER_ABI,
  LENDING_POOL_ABI,
  COLLATERAL_MANAGER_ABI,
  COSIGNING_MANAGER_ABI,
  PRICE_ORACLE_ABI,
  LENDING_POOL_LENS_ABI,
  ERC20_ABI,
} from '../utils/constants';

const Web3Context = createContext(null);

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return context;
};

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Contract instances
  const [contracts, setContracts] = useState({
    reputationManager: null,
    lendingPool: null,
    collateralManager: null,
    coSigningManager: null,
    priceOracle: null,
    lendingPoolLens: null,
  });

  // Initialize contracts
  const initializeContracts = useCallback((signerOrProvider) => {
    try {
      console.log('🔧 Initializing contracts with addresses:', CONTRACT_ADDRESSES);

      const reputationManager = new ethers.Contract(
        CONTRACT_ADDRESSES.reputationManager,
        REPUTATION_MANAGER_ABI,
        signerOrProvider
      );

      const lendingPool = new ethers.Contract(
        CONTRACT_ADDRESSES.lendingPool,
        LENDING_POOL_ABI,
        signerOrProvider
      );

      const collateralManager = new ethers.Contract(
        CONTRACT_ADDRESSES.collateralManager,
        COLLATERAL_MANAGER_ABI,
        signerOrProvider
      );

      const coSigningManager = new ethers.Contract(
        CONTRACT_ADDRESSES.coSigningManager,
        COSIGNING_MANAGER_ABI,
        signerOrProvider
      );

      const priceOracle = new ethers.Contract(
        CONTRACT_ADDRESSES.priceOracle,
        PRICE_ORACLE_ABI,
        signerOrProvider
      );

      const lendingPoolLens = new ethers.Contract(
        CONTRACT_ADDRESSES.lendingPoolLens,
        LENDING_POOL_LENS_ABI,
        signerOrProvider
      );

      setContracts({
        reputationManager,
        lendingPool,
        collateralManager,
        coSigningManager,
        priceOracle,
        lendingPoolLens,
      });

      console.log('✅ All contracts initialized successfully');
    } catch (err) {
      console.error('Failed to initialize contracts:', err);
      setError('Failed to initialize contracts');
    }
  }, []);

  // ✅ NEW: Auto-connect to localhost provider for read-only access
  useEffect(() => {
    const initReadOnlyProvider = async () => {
      try {
        console.log('🔌 Connecting to localhost Hardhat node...');
        
        // Create read-only provider for localhost
        const readOnlyProvider = new ethers.JsonRpcProvider('http://localhost:8545');
        
        // Test the connection
        const network = await readOnlyProvider.getNetwork();
        console.log('✅ Connected to network:', {
          name: 'localhost',
          chainId: network.chainId.toString()
        });
        
        setProvider(readOnlyProvider);
        setChainId(network.chainId.toString());
        
        // Initialize contracts with read-only provider
        initializeContracts(readOnlyProvider);
        
        console.log('✅ Read-only provider connected to localhost:8545');
      } catch (err) {
        console.warn('⚠️ Could not connect read-only provider:', err.message);
        console.warn('   Make sure Hardhat node is running: npx hardhat node');
      }
    };

    // Initialize read-only provider immediately for viewing data
    if (!provider) {
      initReadOnlyProvider();
    }
  }, [initializeContracts]);

  // Connect wallet (MetaMask)
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or another Web3 wallet');
      return false;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const web3Signer = await web3Provider.getSigner();
      const network = await web3Provider.getNetwork();

      setAccount(accounts[0]);
      setProvider(web3Provider);
      setSigner(web3Signer);
      setChainId(network.chainId.toString());

      // Re-initialize contracts with signer for transactions
      initializeContracts(web3Signer);

      setIsConnecting(false);
      console.log('✅ Wallet connected:', accounts[0]);
      return true;
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'Failed to connect wallet');
      setIsConnecting(false);
      return false;
    }
  }, [initializeContracts]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setSigner(null);
    
    // Keep provider and contracts for read-only access
    console.log('🔌 Wallet disconnected (read-only mode)');
  }, []);

  // Switch network
  const switchNetwork = useCallback(async (targetNetwork = 'localhost') => {
    if (!window.ethereum) {
      setError('Please install MetaMask');
      return false;
    }

    const networkConfig = NETWORK_CONFIG[targetNetwork];
    if (!networkConfig) {
      setError('Unsupported network');
      return false;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: networkConfig.chainId }],
      });
      return true;
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [networkConfig],
          });
          return true;
        } catch (addError) {
          console.error('Failed to add network:', addError);
          setError('Failed to add network');
          return false;
        }
      }
      console.error('Failed to switch network:', switchError);
      setError('Failed to switch network');
      return false;
    }
  }, []);

  // Get ERC20 token contract
  const getTokenContract = useCallback((tokenAddress) => {
    if (!signer && !provider) return null;
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer || provider);
  }, [signer, provider]);

  // Check token allowance
  const checkAllowance = useCallback(async (tokenAddress, spenderAddress) => {
    if (!account || !provider) return '0';
    
    try {
      const tokenContract = getTokenContract(tokenAddress);
      const allowance = await tokenContract.allowance(account, spenderAddress);
      return allowance.toString();
    } catch (err) {
      console.error('Failed to check allowance:', err);
      return '0';
    }
  }, [account, provider, getTokenContract]);

  // Approve token spending
  const approveToken = useCallback(async (tokenAddress, spenderAddress, amount) => {
    if (!signer) {
      throw new Error('Wallet not connected');
    }

    try {
      const tokenContract = getTokenContract(tokenAddress);
      const tx = await tokenContract.approve(spenderAddress, amount);
      await tx.wait();
      return tx;
    } catch (err) {
      console.error('Failed to approve token:', err);
      throw err;
    }
  }, [signer, getTokenContract]);

  // Get token balance
  const getTokenBalance = useCallback(async (tokenAddress, userAddress = account) => {
    if (!provider || !userAddress) return '0';

    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const balance = await tokenContract.balanceOf(userAddress);
      return balance.toString();
    } catch (err) {
      console.error('Failed to get token balance:', err);
      return '0';
    }
  }, [provider, account]);

  // Listen for account changes (only if wallet is connected)
  useEffect(() => {
    if (!window.ethereum || !account) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else if (accounts[0] !== account) {
        setAccount(accounts[0]);
        if (signer) {
          initializeContracts(signer);
        }
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [account, signer, disconnectWallet, initializeContracts]);

  const value = {
    account,
    provider,
    signer,
    chainId,
    isConnecting,
    error,
    contracts,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    getTokenContract,
    checkAllowance,
    approveToken,
    getTokenBalance,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};