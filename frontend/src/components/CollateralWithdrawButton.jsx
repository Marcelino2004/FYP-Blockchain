// CollateralWithdrawButton.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Button, Alert } from '.';
import { ethers } from 'ethers';

export const CollateralWithdrawButton = ({ loan, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedDepositId, setResolvedDepositId] = useState(null);
  const [resolving, setResolving] = useState(true);

  // Permanent latch — survives re-renders, resets only when component fully unmounts
  const withdrawnRef = useRef(false);

  useEffect(() => {
    // Once withdrawn, never re-resolve — deposit struct is deleted on-chain
    if (withdrawnRef.current) {
      setResolving(false);
      return;
    }

    const resolve = async () => {
      setResolving(true);
      setResolvedDepositId(null);

      try {
        if (!contracts?.collateralManager) return;

        // ── Path 1: loan struct already has a non-zero depositId ─────────────
        const rawId = loan?.collateralDepositId;
        if (rawId && String(rawId) !== '0') {
          // Verify deposit still exists on-chain (not already withdrawn)
          try {
            const dep = await contracts.collateralManager.getCollateralDeposit(rawId);
            const depositorIsZero = !dep.depositor || dep.depositor === ethers.ZeroAddress;
            const depositIdIsZero = !dep.depositId || dep.depositId.toString() === '0';
            if (depositorIsZero || depositIdIsZero) {
              // Already withdrawn — delete zeroed the struct
              return;
            }
          } catch {
            return; // Can't verify — hide the button
          }
          setResolvedDepositId(String(rawId));
          return;
        }

        // ── Path 2: fallback via getLoanCollateral (BORROW_REQUEST) ──────────
        if (!loan?.loanId) return;

        const deposits = await contracts.collateralManager.getLoanCollateral(loan.loanId);
        if (!deposits || deposits.length === 0) return;

        const dep = deposits[0];

        // After withdrawCollateral(), the struct is deleted — all fields zero out
        const depositorIsZero = !dep.depositor || dep.depositor === ethers.ZeroAddress;
        const depositIdIsZero = !dep.depositId || dep.depositId.toString() === '0';
        if (depositorIsZero || depositIdIsZero) return;

        setResolvedDepositId(dep.depositId.toString());
      } catch (err) {
        console.warn('[CollateralWithdrawButton] resolve error:', err.message);
      } finally {
        setResolving(false);
      }
    };

    resolve();
  }, [loan?.loanId, loan?.collateralDepositId, contracts?.collateralManager]);

  // ── Visibility guards ─────────────────────────────────────────────────────
  if (loan?.status !== 'REPAID') return null;
  if (!account || loan.borrower?.toLowerCase() !== account.toLowerCase()) return null;
  if (resolving) return null;
  if (withdrawnRef.current) return null;
  if (!resolvedDepositId || resolvedDepositId === '0') return null;

  // ── Withdrawal ────────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    setLoading(true);
    setError('');

    try {
      if (!contracts.collateralManager) {
        throw new Error('Contracts not initialized. Please connect your wallet.');
      }

      const deposit = await contracts.collateralManager.getCollateralDeposit(resolvedDepositId);

      if (!deposit.depositor || deposit.depositor === ethers.ZeroAddress) {
        throw new Error('Collateral deposit not found — it may have already been withdrawn.');
      }
      if (deposit.isLocked) {
        throw new Error('Collateral is still locked. This loan may not be fully repaid yet.');
      }

      const tx = await contracts.collateralManager.withdrawCollateral(BigInt(resolvedDepositId));
      await tx.wait();

      // Set withdrawn BEFORE triggering any re-render or refetch
      withdrawnRef.current = true;
      setResolvedDepositId(null);

      // Delay refetch so chain state settles before getLoanCollateral is re-queried
      if (onSuccess) setTimeout(onSuccess, 2000);

    } catch (err) {
      let msg = 'Failed to withdraw collateral';
      if (err.message.includes('DepositLocked') || err.message.includes('locked')) {
        msg = 'Collateral is still locked. Complete loan repayment first.';
      } else if (err.message.includes('DepositNotFound') || err.message.includes('not found')) {
        msg = 'Collateral deposit not found — it may already be withdrawn.';
      } else if (err.message.includes('UnauthorizedWithdrawal') || err.message.includes('unauthorized')) {
        msg = 'You are not authorized to withdraw this collateral.';
      } else if (err.message.includes('user rejected')) {
        msg = 'Transaction rejected.';
      } else if (err.reason) {
        msg = err.reason;
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        variant="success"
        onClick={handleWithdraw}
        loading={loading}
        className="w-full"
      >
        {loading ? 'Withdrawing...' : '💰 Withdraw Collateral'}
      </Button>
      <p className="text-xs text-gray-600 text-center">
        Your collateral has been unlocked and is ready to withdraw
      </p>
    </div>
  );
};

export default CollateralWithdrawButton;