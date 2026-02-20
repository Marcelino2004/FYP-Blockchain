import React, { useState, useEffect, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useCoSigning } from '../hooks';
import {
  Card,
  Button,
  Badge,
  LoadingSpinner,
  EmptyState,
  Modal,
  Alert,
  AddressDisplay,
} from '../components';
import { formatTimeAgo } from '../utils/formatters';
import api from '../services/api';

// ─── helpers ────────────────────────────────────────────────────────────────

const parseError = (err) => {
  if (err.code === 'ACTION_REJECTED' || err.code === 4001)
    return 'Transaction rejected in wallet.';
  if (err.message?.includes('InsufficientReputation'))
    return 'You need at least 200 reputation to co-sign.';
  if (err.message?.includes('RequestNotActive'))
    return 'This request is no longer active.';
  if (err.message?.includes('CannotCoSignSelf'))
    return 'You cannot co-sign your own request.';
  if (err.message?.includes('RequestNotFound'))
    return 'Request not found on-chain.';
  if (err.message?.includes('InvalidBonus'))
    return 'Requested bonus must be greater than 0.';
  if (err.message?.includes('LoanNotFound'))
    return 'The loan offer no longer exists.';
  return err.message || 'Transaction failed. Please try again.';
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const CoSigningPage = () => {
  const { account, contracts } = useWeb3();
  const { coSignings, requests, stats, loading, refetch } = useCoSigning(account);
  const [activeTab, setActiveTab] = useState('requests');
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const handleCancelRequest = async (requestId) => {
    if (!contracts?.coSigningManager) return;
    setCancellingId(requestId);
    try {
      const tx = await contracts.coSigningManager.cancelCoSigningRequest(requestId);
      await tx.wait();
      refetch();
    } catch (err) {
      console.error('❌ cancelCoSigningRequest:', err);
      alert(parseError(err));
    } finally {
      setCancellingId(null);
    }
  };

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          Please connect your wallet to view co-signing opportunities.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Co-signing</h1>
          <p className="text-gray-600">Vouch for borrowers and earn reputation bonuses</p>
        </div>
        <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
          + Request Co-signer
        </Button>
      </div>

      {/* Info Banner */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200">
        <div className="flex items-start gap-4">
          <svg className="h-8 w-8 text-purple-600 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg">How it works</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              <strong>Borrowers</strong>: click "Request Co-signer" to attach a co-sign request to one of your active borrow offers.&nbsp;
              <strong>Co-signers</strong>: stake your reputation to boost the borrower's score — earn a reward on repayment, or face a penalty on default.
            </p>
          </div>
        </div>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.totalCoSignings, color: 'text-gray-900' },
            { label: 'Active', value: stats.activeCoSignings, color: 'text-blue-600' },
            { label: 'Successful', value: stats.successfulCoSignings, color: 'text-green-600' },
            { label: 'Defaulted', value: stats.defaultedCoSignings, color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <div className="text-center">
                <p className="text-gray-500 text-sm mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        {[
          { key: 'requests', label: 'Open Requests', count: requests.length, badge: 'info' },
          { key: 'myCoSignings', label: 'My Co-signings', count: coSignings.length, badge: 'success' },
        ].map(({ key, label, count, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {label}
            <Badge variant={badge} className="ml-2">{count}</Badge>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>
      ) : activeTab === 'requests' ? (
        <RequestsList
          requests={requests}
          currentAccount={account}
          onAccept={(req) => { setSelectedRequest(req); setAcceptModalOpen(true); }}
          onCancel={handleCancelRequest}
          cancellingId={cancellingId}
        />
      ) : (
        <CoSigningsList coSignings={coSignings} />
      )}

      {/* Modals */}
      <AcceptCoSignModal
        isOpen={acceptModalOpen}
        onClose={() => setAcceptModalOpen(false)}
        request={selectedRequest}
        onSuccess={() => { setAcceptModalOpen(false); refetch(); }}
      />

      <CreateRequestModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        currentAccount={account}
        onSuccess={() => { setCreateModalOpen(false); refetch(); }}
      />
    </div>
  );
};

// ─── RequestsList ─────────────────────────────────────────────────────────────

const RequestsList = ({ requests, currentAccount, onAccept, onCancel, cancellingId }) => {
  if (requests.length === 0) {
    return (
      <EmptyState
        title="No open requests"
        description="No co-signing requests right now. Borrowers can click 'Request Co-signer' to create one."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {requests.map((request) => {
        const isOwn = request.borrower?.toLowerCase() === currentAccount?.toLowerCase();
        const isCancelling = cancellingId === request.requestId;
        return (
          <Card key={request.requestId} hover>
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">Request #{request.requestId}</h3>
                  <p className="text-sm text-gray-500">{formatTimeAgo(request.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  {isOwn && <Badge variant="warning">Your Request</Badge>}
                  <Badge variant="info">Open</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Borrower</span>
                  <AddressDisplay address={request.borrower} shortened />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Loan Offer ID</span>
                  <span className="font-mono">#{request.loanOfferId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Bonus</span>
                  <span className="text-xs text-gray-500 italic">Calculated from your reputation</span>
                </div>
              </div>

              {request.message && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Borrower's message:</p>
                  <p className="text-sm text-gray-700 italic">"{request.message}"</p>
                </div>
              )}

              {isOwn ? (
                <div className="space-y-2">
                  <div className="w-full py-2 text-center text-sm text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    ⏳ Waiting for a co-signer to accept
                  </div>
                  <Button
                    variant="danger"
                    onClick={() => onCancel(request.requestId)}
                    loading={isCancelling}
                    disabled={isCancelling}
                    className="w-full"
                  >
                    Cancel Request
                  </Button>
                </div>
              ) : (
                <Button variant="primary" onClick={() => onAccept(request)} className="w-full">
                  Accept &amp; Co-sign
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

// ─── CoSigningsList ───────────────────────────────────────────────────────────

const CoSigningsList = ({ coSignings }) => {
  if (coSignings.length === 0) {
    return (
      <EmptyState
        title="No co-signings yet"
        description="You haven't co-signed any loans yet. Browse open requests to get started."
      />
    );
  }

  return (
    <div className="space-y-4">
      {coSignings.map((cs) => (
        <Card key={cs.recordId}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-semibold">Co-signing #{cs.recordId}</h3>
                {cs.wasCancelled && <Badge variant="warning">Cancelled</Badge>}
                {cs.isActive && !cs.loanCompleted && !cs.wasCancelled && <Badge variant="info">Active</Badge>}
                {cs.loanCompleted && !cs.borrowerDefaulted && !cs.wasCancelled && <Badge variant="success">Completed ✓</Badge>}
                {cs.borrowerDefaulted && <Badge variant="danger">Defaulted ✗</Badge>}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Borrower</p>
                  <AddressDisplay address={cs.borrower} shortened />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Loan ID</p>
                  <p className="font-mono text-sm">#{cs.loanId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Rep Staked</p>
                  <p className="font-semibold">{cs.reputationStaked}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Bonus Given</p>
                  <p className="font-semibold text-purple-600">+{cs.bonusProvided}</p>
                </div>
              </div>

              <p className="text-sm text-gray-500">Co-signed {formatTimeAgo(cs.coSignTimestamp)}</p>

              {cs.borrowerDefaulted && (
                <Alert variant="error">This borrower defaulted. A reputation penalty has been applied.</Alert>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 min-w-[110px]">
              {cs.isActive && !cs.loanCompleted && (
                <span className="flex items-center gap-2 text-blue-600 text-sm font-medium">
                  <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                  Loan Active
                </span>
              )}
              {cs.loanCompleted && !cs.borrowerDefaulted && (
                <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Earned Bonus
                </span>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

// ─── CreateRequestModal ───────────────────────────────────────────────────────

const CreateRequestModal = ({ isOpen, onClose, currentAccount, onSuccess }) => {
  const { contracts, signer } = useWeb3();

  const [myOffers, setMyOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState('');

  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [message, setMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [success, setSuccess] = useState(false);

  const loadMyOffers = useCallback(async () => {
    if (!currentAccount) return;
    setOffersLoading(true);
    setOffersError('');
    try {
      const data = await api.getBorrowerRequests();
      const all = data.requests || [];
      const mine = all.filter(
        (o) => o.creator?.toLowerCase() === currentAccount.toLowerCase()
      );
      setMyOffers(mine);
      if (mine.length === 0) setOffersError('no_offers');
    } catch (err) {
      console.error('Failed to load offers:', err);
      setOffersError('Failed to load your borrow requests.');
    } finally {
      setOffersLoading(false);
    }
  }, [currentAccount]);

  useEffect(() => {
    if (isOpen) {
      setSelectedOfferId('');
      setMessage('');
      setError('');
      setTxHash('');
      setSuccess(false);
      loadMyOffers();
    }
  }, [isOpen]);

  const selectedOffer = myOffers.find((o) => o.offerId === selectedOfferId);

  const handleSubmit = async () => {
    if (!selectedOfferId) { setError('Please select a borrow request.'); return; }
    if (!contracts.coSigningManager) { setError('Contract not initialised. Refresh and reconnect.'); return; }
    if (!signer) { setError('Please connect your wallet first.'); return; }

    setLoading(true);
    setError('');
    setTxHash('');

    try {
      console.log('📝 createCoSigningRequest — offer', selectedOfferId);
      const tx = await contracts.coSigningManager.createCoSigningRequest(
        selectedOfferId,
        1,
        message.trim()
      );
      setTxHash(tx.hash);
      await tx.wait();
      console.log('✅ Request created');
      setSuccess(true);
    } catch (err) {
      console.error('❌ createCoSigningRequest:', err);
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request a Co-signer" size="md">
      <div className="space-y-5">

        {success ? (
          <>
            <Alert variant="success">
              <p className="font-semibold">✅ Co-signing request created!</p>
              <p className="text-sm mt-1">
                Your request is now visible to everyone on the Co-signing page.
                Anyone with enough reputation can accept it.
              </p>
              {txHash && <p className="text-xs font-mono mt-2 break-all">Tx: {txHash}</p>}
            </Alert>
            <Button variant="primary" onClick={onSuccess} className="w-full">Done</Button>
          </>
        ) : (
          <>
            {error && <Alert variant="error">{error}</Alert>}

            <Alert variant="info">
              <p className="text-sm">
                Select one of your active <strong>Borrow Requests</strong>. A co-signer
                will stake their reputation to boost yours — the bonus you receive is automatically
                calculated from their reputation score (~10% of it, capped at 50).
              </p>
            </Alert>

            {/* Step 1 — Pick a borrow request */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">
                1. Your active Borrow Request
              </p>

              {offersLoading ? (
                <div className="flex items-center gap-2 py-4 text-gray-500 text-sm">
                  <LoadingSpinner size="sm" /> Loading your offers…
                </div>
              ) : offersError === 'no_offers' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-2">
                  <p className="font-semibold">No active borrow requests found.</p>
                  <p>
                    Go to the{' '}
                    <a href="/marketplace" className="underline font-medium">Marketplace</a>{' '}
                    and create a <strong>Borrow Request</strong> first, then come back here.
                  </p>
                </div>
              ) : offersError ? (
                <Alert variant="error">{offersError}</Alert>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {myOffers.map((offer) => (
                    <button
                      key={offer.offerId}
                      onClick={() => setSelectedOfferId(offer.offerId)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        selectedOfferId === offer.offerId
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm">
                          Offer #{offer.offerId}
                          <span className="ml-2 text-gray-500 font-normal text-xs">{offer.terms?.duration}</span>
                        </span>
                        <span className="font-bold text-sm text-blue-700">
                          {offer.terms?.principalAmount}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Interest: {offer.terms?.interestRate} · Collateral: {offer.terms?.collateralRatio}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2 — Message */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">
                2. Message to potential co-signers{' '}
                <span className="font-normal text-gray-400">(optional)</span>
              </p>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell co-signers why they should trust you — e.g. loan history, reason for borrowing…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                maxLength={300}
              />
              <p className="text-xs text-gray-400 text-right mt-1">{message.length}/300</p>
            </div>

            {/* Summary card */}
            {selectedOffer && (
              <Card className="bg-blue-50 border border-blue-200">
                <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Summary</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Offer</span>
                    <span className="font-mono font-semibold">#{selectedOffer.offerId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Borrow amount</span>
                    <span className="font-semibold">{selectedOffer.terms?.principalAmount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interest</span>
                    <span>{selectedOffer.terms?.interestRate}</span>
                  </div>
                  <div className="flex justify-between border-t border-blue-200 pt-2 mt-1">
                    <span className="text-gray-700 font-medium">Bonus co-signer will give you</span>
                    <span className="text-sm text-gray-500 italic">~10% of their reputation</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Tx pending indicator */}
            {loading && txHash && (
              <Alert variant="info">
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <div>
                    <p className="font-semibold text-sm">Waiting for confirmation…</p>
                    <p className="text-xs font-mono break-all mt-1">{txHash}</p>
                  </div>
                </div>
              </Alert>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={onClose} className="flex-1" disabled={loading}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                loading={loading}
                disabled={loading || !selectedOfferId || offersError === 'no_offers'}
                className="flex-1"
              >
                {loading ? 'Submitting…' : 'Create Request'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

// ─── AcceptCoSignModal ────────────────────────────────────────────────────────

const AcceptCoSignModal = ({ isOpen, onClose, request, onSuccess }) => {
  const { contracts, signer } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) { setError(''); setTxHash(''); setSuccess(false); }
  }, [isOpen]);

  if (!request) return null;

  const handleAccept = async () => {
    if (!contracts.coSigningManager) { setError('Contract not initialised. Refresh and reconnect.'); return; }
    if (!signer) { setError('Please connect your wallet first.'); return; }

    setLoading(true);
    setError('');
    setTxHash('');

    try {
      console.log('🔄 acceptCoSigningRequest:', request.requestId);
      const tx = await contracts.coSigningManager.acceptCoSigningRequest(request.requestId);
      setTxHash(tx.hash);
      await tx.wait();
      console.log('✅ Accepted');
      setSuccess(true);
    } catch (err) {
      console.error('❌ acceptCoSigningRequest:', err);
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Accept Co-signing Request" size="md">
      <div className="space-y-4">

        {success ? (
          <>
            <Alert variant="success">
              <p className="font-semibold">✅ Co-signing accepted!</p>
              <p className="text-sm mt-1">Your reputation is now staked. You'll earn a bonus when this borrower repays.</p>
              {txHash && <p className="text-xs font-mono mt-2 break-all">Tx: {txHash}</p>}
            </Alert>
            <Button variant="primary" onClick={onSuccess} className="w-full">Done</Button>
          </>
        ) : (
          <>
            {error && <Alert variant="error">{error}</Alert>}

            {!loading && (
              <Alert variant="warning">
                <p className="font-semibold text-sm">⚠️ Your reputation is at stake</p>
                <p className="text-sm mt-1">
                  If this borrower defaults, you will receive a reputation penalty.
                  Only co-sign for people you trust.
                </p>
              </Alert>
            )}

            {loading && txHash && (
              <Alert variant="info">
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <div>
                    <p className="font-semibold text-sm">Waiting for confirmation…</p>
                    <p className="text-xs font-mono break-all mt-1">{txHash}</p>
                  </div>
                </div>
              </Alert>
            )}

            <Card className="bg-blue-50">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Request ID</span>
                  <span className="font-semibold">#{request.requestId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Borrower</span>
                  <AddressDisplay address={request.borrower} shortened />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Loan Offer</span>
                  <span className="font-mono">#{request.loanOfferId}</span>
                </div>
                <div className="flex justify-between border-t border-blue-200 pt-2 mt-1">
                  <span className="font-medium">Bonus you'll give borrower</span>
                  <span className="text-sm text-gray-500 italic">~10% of your reputation score</span>
                </div>
              </div>
            </Card>

            {request.message && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Message from borrower:</p>
                <p className="text-sm italic">"{request.message}"</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={onClose} className="flex-1" disabled={loading}>Cancel</Button>
              <Button variant="primary" loading={loading} onClick={handleAccept} className="flex-1" disabled={loading}>
                Accept &amp; Co-sign
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default CoSigningPage;