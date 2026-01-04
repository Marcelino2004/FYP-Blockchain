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
  });

  // Initialize contracts
  const initializeContracts = useCallback((signerOrProvider) => {
    try {
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

      setContracts({
        reputationManager,
        lendingPool,
        collateralManager,
        coSigningManager,
        priceOracle,
      });
    } catch (err) {
      console.error('Failed to initialize contracts:', err);
      setError('Failed to initialize contracts');
    }
  }, []);

  // Connect wallet
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

      initializeContracts(web3Signer);

      setIsConnecting(false);
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
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setContracts({
      reputationManager: null,
      lendingPool: null,
      collateralManager: null,
      coSigningManager: null,
      priceOracle: null,
    });
  }, []);

  // Switch network
  const switchNetwork = useCallback(async (targetNetwork = 'sepolia') => {
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
    if (!signer) return null;
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  }, [signer]);

  // Check token allowance
  const checkAllowance = useCallback(async (tokenAddress, spenderAddress) => {
    if (!account || !signer) return '0';
    
    try {
      const tokenContract = getTokenContract(tokenAddress);
      const allowance = await tokenContract.allowance(account, spenderAddress);
      return allowance.toString();
    } catch (err) {
      console.error('Failed to check allowance:', err);
      return '0';
    }
  }, [account, signer, getTokenContract]);

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

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

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

  // Auto-connect if previously connected
  useEffect(() => {
    const autoConnect = async () => {
      if (!window.ethereum) return;

      try {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });

        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (err) {
        console.error('Auto-connect failed:', err);
      }
    };

    autoConnect();
  }, []);

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