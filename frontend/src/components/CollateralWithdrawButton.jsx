// CollateralWithdrawButton.jsx  ── DIAGNOSTIC BUILD
// Every guard that can hide the button logs WHY it returned null.
// Check the browser console after a REPAID loan loads.
import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { Button, Alert } from '.';
import { ethers } from 'ethers';

export const CollateralWithdrawButton = ({ loan, onSuccess }) => {
  const { contracts, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedDepositId, setResolvedDepositId] = useState(null);
  const [resolving, setResolving] = useState(true);

  const TAG = `[CollateralWithdrawButton loan#${loan?.loanId}]`;

  // ── Deposit ID resolution ─────────────────────────────────────────────────
  useEffect(() => {
    const resolve = async () => {
      setResolving(true);
      setResolvedDepositId(null);

      console.group(`${TAG} resolving deposit ID`);
      console.log('loan.status            :', loan?.status);
      console.log('loan.borrower          :', loan?.borrower);
      console.log('account                :', account);
      console.log('loan.collateralDepositId:', loan?.collateralDepositId);
      console.log('loan.loanId            :', loan?.loanId);
      console.log('contracts.collateralManager:', !!contracts?.collateralManager);

      try {
        if (!contracts?.collateralManager) {
          console.warn(`${TAG} collateralManager contract not available yet — skipping`);
          console.groupEnd();
          return;
        }

        // Step 1: use the stored depositId if non-zero
        const rawId = loan?.collateralDepositId;
        if (rawId && String(rawId) !== '0') {
          console.log(`${TAG} ✅ Using loan.collateralDepositId directly:`, rawId);
          setResolvedDepositId(String(rawId));
          console.groupEnd();
          return;
        }

        console.log(`${TAG} collateralDepositId is 0 or missing — falling back to getLoanCollateral(${loan?.loanId})`);

        // Step 2: fall back to getLoanCollateral
        if (!loan?.loanId) {
          console.warn(`${TAG} loanId is missing, cannot fall back`);
          console.groupEnd();
          return;
        }

        const deposits = await contracts.collateralManager.getLoanCollateral(loan.loanId);
        console.log(`${TAG} getLoanCollateral returned`, deposits?.length ?? 0, 'deposits:', deposits);

        if (!deposits || deposits.length === 0) {
          console.warn(`${TAG} ❌ No deposits found via getLoanCollateral — button will be hidden`);
          console.groupEnd();
          return;
        }

        const dep = deposits[0];
        console.log(`${TAG} First deposit:`, {
          depositId: dep.depositId?.toString(),
          depositor: dep.depositor,
          isLocked: dep.isLocked,
          amount: dep.amount?.toString(),
        });

        if (!dep.depositor || dep.depositor === ethers.ZeroAddress) {
          console.warn(`${TAG} ❌ Deposit has zero-address depositor (already withdrawn) — hiding button`);
          console.groupEnd();
          return;
        }

        const id = dep.depositId.toString();
        console.log(`${TAG} ✅ Resolved depositId via getLoanCollateral:`, id);
        setResolvedDepositId(id);
      } catch (err) {
        console.error(`${TAG} ❌ Error resolving depositId:`, err);
      } finally {
        console.groupEnd();
        setResolving(false);
      }
    };

    resolve();
  }, [loan?.loanId, loan?.collateralDepositId, contracts?.collateralManager]);

  // ── Visibility guards — each one logs why it hides the button ─────────────
  if (loan?.status !== 'REPAID') {
    // Only log for non-trivial statuses so we don't spam active loan cards
    if (loan?.status === 'ACTIVE') return null;
    console.log(`${TAG} hidden — status is "${loan?.status}" (need REPAID)`);
    return null;
  }

  if (!account) {
    console.log(`${TAG} hidden — no wallet connected`);
    return null;
  }

  if (!loan?.borrower || loan.borrower.toLowerCase() !== account.toLowerCase()) {
    console.log(`${TAG} hidden — account is not the borrower`, {
      borrower: loan?.borrower,
      account,
    });
    return null;
  }

  if (resolving) {
    // Silently wait — don't flash the button
    return null;
  }

  if (!resolvedDepositId || resolvedDepositId === '0') {
    console.warn(`${TAG} ❌ No valid depositId resolved — button hidden.`);
    console.warn(`   Possible causes:`);
    console.warn(`   1. Loan was created before the BORROW_REQUEST collateral fix`);
    console.warn(`   2. CollateralManager.getLoanCollateral returned empty`);
    console.warn(`   3. No collateral was required for this loan`);
    return null;
  }

  console.log(`${TAG} ✅ Rendering withdraw button for depositId:`, resolvedDepositId);

  // ── Withdrawal handler ────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    setLoading(true);
    setError('');

    try {
      if (!contracts.collateralManager) {
        throw new Error('Contracts not initialized. Please connect your wallet.');
      }

      console.log(`${TAG} withdrawing deposit:`, resolvedDepositId);

      const deposit = await contracts.collateralManager.getCollateralDeposit(resolvedDepositId);
      console.log(`${TAG} on-chain deposit state:`, {
        depositId: deposit.depositId?.toString(),
        depositor: deposit.depositor,
        isLocked: deposit.isLocked,
        amount: deposit.amount?.toString(),
      });

      if (!deposit.depositor || deposit.depositor === ethers.ZeroAddress) {
        throw new Error('Collateral deposit not found — it may have already been withdrawn.');
      }
      if (deposit.isLocked) {
        throw new Error('Collateral is still locked. This loan may not be fully repaid yet.');
      }

      const tx = await contracts.collateralManager.withdrawCollateral(BigInt(resolvedDepositId));
      console.log(`${TAG} tx sent:`, tx.hash);
      const receipt = await tx.wait();
      console.log(`${TAG} ✅ confirmed:`, receipt);

      setResolvedDepositId(null);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(`${TAG} withdrawal error:`, err);

      let errorMessage = 'Failed to withdraw collateral';
      if (err.message.includes('locked') || err.message.includes('DepositLocked')) {
        errorMessage = 'Collateral is still locked. Complete loan repayment first.';
      } else if (err.message.includes('not found') || err.message.includes('DepositNotFound')) {
        errorMessage = 'Collateral deposit not found — it may already be withdrawn.';
      } else if (err.message.includes('unauthorized') || err.message.includes('UnauthorizedWithdrawal')) {
        errorMessage = 'You are not authorized to withdraw this collateral.';
      } else if (err.message.includes('user rejected')) {
        errorMessage = 'Transaction rejected.';
      } else if (err.reason) {
        errorMessage = err.reason;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <Alert variant="error">{error}</Alert>}
      <Button variant="success" onClick={handleWithdraw} loading={loading} className="w-full">
        {loading ? 'Withdrawing...' : '💰 Withdraw Collateral'}
      </Button>
      <p className="text-xs text-gray-600 text-center">
        Your collateral has been unlocked and is ready to withdraw
      </p>
    </div>
  );
};

export default CollateralWithdrawButton;