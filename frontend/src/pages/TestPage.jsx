import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Card, Button, LoadingSpinner } from '../components';

const TestPage = () => {
  const { contracts, account, connectWallet } = useWeb3();
  const [testResults, setTestResults] = useState({});
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    const results = {};

    try {
      // Test 1: Check if contracts are loaded
      results.contractsLoaded = !!contracts.lendingPoolLens;
      
      if (contracts.lendingPoolLens) {
        // Test 2: Get contract address
        try {
          const address = await contracts.lendingPoolLens.getAddress();
          results.lensAddress = address;
        } catch (err) {
          results.lensAddressError = err.message;
        }

        // Test 3: Call getPlatformStats
        try {
          const stats = await contracts.lendingPoolLens.getPlatformStats();
          results.platformStats = {
            totalLoans: stats[0].toString(),
            totalOffers: stats[1].toString(),
            activeLenderOffers: stats[2].toString(),
            activeBorrowerRequests: stats[3].toString(),
            platformFeeRate: stats[4].toString(),
          };
        } catch (err) {
          results.platformStatsError = err.message;
        }
      }

      // Test 4: Check LendingPool
      if (contracts.lendingPool) {
        try {
          const nextLoanId = await contracts.lendingPool.nextLoanId();
          results.nextLoanId = nextLoanId.toString();
        } catch (err) {
          results.nextLoanIdError = err.message;
        }
      }

    } catch (err) {
      results.generalError = err.message;
    }

    setTestResults(results);
    setLoading(false);
  };

  useEffect(() => {
    if (contracts.lendingPoolLens) {
      runTests();
    }
  }, [contracts]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <h1 className="text-2xl font-bold mb-4">Frontend Connection Test</h1>
        
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold mb-2">Wallet Status:</h2>
            {account ? (
              <p className="text-green-600">✅ Connected: {account}</p>
            ) : (
              <div>
                <p className="text-yellow-600">⚠️ Not connected</p>
                <Button onClick={connectWallet} className="mt-2">
                  Connect Wallet
                </Button>
              </div>
            )}
          </div>

          <div>
            <h2 className="font-semibold mb-2">Contract Addresses:</h2>
            <div className="space-y-1 text-sm font-mono bg-gray-100 p-3 rounded">
              <p>LendingPool: {import.meta.env.VITE_LENDING_POOL || '❌ NOT SET'}</p>
              <p>LendingPoolLens: {import.meta.env.VITE_LENDING_POOL_LENS || '❌ NOT SET'}</p>
              <p>ReputationManager: {import.meta.env.VITE_REPUTATION_MANAGER || '❌ NOT SET'}</p>
            </div>
          </div>

          <div>
            <h2 className="font-semibold mb-2">Contract Test Results:</h2>
            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="space-y-2 text-sm">
                <Button onClick={runTests} variant="primary">
                  Run Tests
                </Button>
                
                <pre className="bg-gray-100 p-3 rounded overflow-auto">
                  {JSON.stringify(testResults, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default TestPage;