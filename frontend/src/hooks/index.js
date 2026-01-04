// frontend/src/hooks/index.js

import { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../context/Web3Context";
import api from "../services/api";
import { ethers } from "ethers";

// ============ useReputation Hook ============
export const useReputation = (address) => {
  const [reputation, setReputation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReputation = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.getReputation(address);
      setReputation(data);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch reputation:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchReputation();
  }, [fetchReputation]);

  return { reputation, loading, error, refetch: fetchReputation };
};

// ============ useLoans Hook ============
export const useLoans = (address) => {
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLoans = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.getUserLoans(address);
      setLoans(data.loans || []);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch loans:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  return { loans, loading, error, refetch: fetchLoans };
};

// ============ useMarketplace Hook ============
export const useMarketplace = () => {
  const [lenderOffers, setLenderOffers] = useState([]);
  const [borrowerRequests, setBorrowerRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [lenders, borrowers] = await Promise.all([
        api.getLenderOffers(),
        api.getBorrowerRequests(),
      ]);

      setLenderOffers(lenders.offers || []);
      setBorrowerRequests(borrowers.requests || []);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch marketplace:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  return {
    lenderOffers,
    borrowerRequests,
    loading,
    error,
    refetch: fetchOffers,
  };
};

// ============ useCollateral Hook ============
export const useCollateral = (address) => {
  const [collateral, setCollateral] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCollateral = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const [userCollateral, supportedTokens] = await Promise.all([
        api.getUserCollateral(address),
        api.getCollateralTokens(),
      ]);

      setCollateral(userCollateral.deposits || []);
      setTokens(supportedTokens.tokens || []);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch collateral:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchCollateral();
  }, [fetchCollateral]);

  return { collateral, tokens, loading, error, refetch: fetchCollateral };
};

// ============ useCoSigning Hook ============
export const useCoSigning = (address) => {
  const [coSignings, setCoSignings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCoSigning = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const [userData, allRequests] = await Promise.all([
        api.getUserCoSignings(address),
        api.getCoSigningRequests(),
      ]);

      setCoSignings(userData.records || []);
      setStats(userData.stats);
      setRequests(allRequests.requests || []);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch co-signing data:", err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchCoSigning();
  }, [fetchCoSigning]);

  return {
    coSignings,
    requests,
    stats,
    loading,
    error,
    refetch: fetchCoSigning,
  };
};

// ============ usePrices Hook ============
export const usePrices = () => {
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getPrices();
      setPrices(data.prices || []);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch prices:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();

    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return { prices, loading, error, refetch: fetchPrices };
};

// ============ usePlatformStats Hook ============
export const usePlatformStats = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getPlatformStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
      console.error("Failed to fetch platform stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
};

// ============ useContract Hook (for direct contract interactions) ============
export const useContract = (contractName) => {
  const { contracts } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const call = useCallback(
    async (method, ...args) => {
      const contract = contracts[contractName];
      if (!contract) {
        throw new Error(`Contract ${contractName} not initialized`);
      }

      setLoading(true);
      setError(null);

      try {
        const result = await contract[method](...args);
        setLoading(false);
        return result;
      } catch (err) {
        setError(err.message);
        setLoading(false);
        throw err;
      }
    },
    [contracts, contractName]
  );

  const send = useCallback(
    async (method, ...args) => {
      const contract = contracts[contractName];
      if (!contract) {
        throw new Error(`Contract ${contractName} not initialized`);
      }

      setLoading(true);
      setError(null);

      try {
        const tx = await contract[method](...args);
        const receipt = await tx.wait();
        setLoading(false);
        return receipt;
      } catch (err) {
        setError(err.message);
        setLoading(false);
        throw err;
      }
    },
    [contracts, contractName]
  );

  return { call, send, loading, error };
};

// ============ useTokenBalance Hook ============
export const useTokenBalance = (tokenAddress) => {
  const { account, getTokenBalance } = useWeb3();
  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!account || !tokenAddress) return;

    setLoading(true);
    try {
      const bal = await getTokenBalance(tokenAddress);
      setBalance(bal);
    } catch (err) {
      console.error("Failed to fetch token balance:", err);
    } finally {
      setLoading(false);
    }
  }, [account, tokenAddress, getTokenBalance]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
};

// ============ useTransaction Hook ============
export const useTransaction = () => {
  const [txState, setTxState] = useState({
    loading: false,
    success: false,
    error: null,
    txHash: null,
  });

  const sendTransaction = useCallback(async (txFunction) => {
    setTxState({ loading: true, success: false, error: null, txHash: null });

    try {
      const tx = await txFunction();
      setTxState((prev) => ({ ...prev, txHash: tx.hash }));

      const receipt = await tx.wait();
      setTxState({
        loading: false,
        success: true,
        error: null,
        txHash: receipt.hash,
      });

      return receipt;
    } catch (err) {
      setTxState({
        loading: false,
        success: false,
        error: err.message || "Transaction failed",
        txHash: null,
      });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setTxState({ loading: false, success: false, error: null, txHash: null });
  }, []);

  return { ...txState, sendTransaction, reset };
};
