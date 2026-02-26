import React, { useState, useCallback } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { useReputation } from '../hooks';
import api from '../services/api';
import {
  Card,
  LoadingSpinner,
  Alert,
  ReputationBadge,
  Badge,
  EmptyState
} from '../components';
import { formatCurrency, formatDate, formatTimeAgo } from '../utils/formatters';

// ─── Verification Modal ────────────────────────────────────────────────────────

const VerificationModal = ({ type, address, onSuccess, onClose }) => {
  const [step, setStep] = useState('input'); // 'input' | 'otp' | 'success'
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [maskedContact, setMaskedContact] = useState('');
  const [bonusPoints, setBonusPoints] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const isEmail = type === 'email';
  const label = isEmail ? 'Email' : 'Phone';
  const placeholder = isEmail ? 'you@example.com' : '+1 234 567 8901';
  const bonus = isEmail ? 30 : 70;

  const startCountdown = useCallback(() => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.sendVerificationOTP(address, type, contact.trim());
      setMaskedContact(res.maskedEmail || res.maskedPhone || contact);
      setStep('otp');
      startCountdown();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;
    setError(null);
    setLoading(true);
    try {
      await api.sendVerificationOTP(address, type, contact.trim());
      startCountdown();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOTP(address, type, otp.trim());
      setBonusPoints(res.bonusPoints || bonus);
      setStep('success');
      setTimeout(() => {
        onSuccess();
      }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-5 ${isEmail ? 'bg-blue-600' : 'bg-emerald-600'} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
                {isEmail ? '📧' : '📱'}
              </div>
              <div>
                <h3 className="text-lg font-bold">Verify {label}</h3>
                <p className="text-sm opacity-80">
                  +{bonus} reputation points
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          {/* Step: Input contact */}
          {step === 'input' && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div>
                <p className="text-gray-600 text-sm mb-4">
                  Enter your {label.toLowerCase()} address to receive a 6-digit verification code.
                </p>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label} Address
                </label>
                <input
                  type={isEmail ? 'email' : 'tel'}
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder={placeholder}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !contact.trim()}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isEmail ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {loading ? <LoadingSpinner size="sm" /> : null}
                {loading ? 'Sending...' : `Send Verification Code`}
              </button>
            </form>
          )}

          {/* Step: Enter OTP */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">{isEmail ? '📬' : '💬'}</span>
                </div>
                <p className="text-gray-700 font-medium text-sm">Code sent to</p>
                <p className="text-gray-900 font-bold">{maskedContact}</p>
                <p className="text-gray-500 text-xs mt-1">Valid for 10 minutes</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                  Enter 6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={handleOtpChange}
                  placeholder="000000"
                  maxLength={6}
                  required
                  className="w-full px-4 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-3xl font-mono tracking-[0.5em] letter-spacing-wide"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isEmail ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {loading ? <LoadingSpinner size="sm" /> : null}
                {loading ? 'Verifying...' : 'Confirm Code'}
              </button>

              <div className="text-center text-sm text-gray-500">
                Didn&apos;t receive it?{' '}
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={countdown > 0 || loading}
                  className={`font-medium transition-colors ${countdown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setStep('input'); setOtp(''); setError(null); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← Change {label.toLowerCase()}
              </button>
            </form>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900">{label} Verified!</h4>
                <p className="text-gray-600 mt-1">
                  Your reputation score has been boosted
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 border border-green-200 rounded-full">
                <span className="text-green-600 font-bold text-lg">+{bonusPoints}</span>
                <span className="text-green-700 text-sm font-medium">reputation points</span>
              </div>
              <p className="text-xs text-gray-400">Closing automatically…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Verification Card ─────────────────────────────────────────────────────────

const VerificationCard = ({ type, verified, address, onVerified }) => {
  const [showModal, setShowModal] = useState(false);
  const isEmail = type === 'email';
  const label = isEmail ? 'Email' : 'Phone Number';
  const bonus = isEmail ? 30 : 70;
  const icon = isEmail ? (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ) : (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );

  const handleSuccess = () => {
    setShowModal(false);
    onVerified();
  };

  return (
    <>
      <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
        verified
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`${verified ? 'text-green-500' : 'text-gray-400'}`}>
            {icon}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{label}</p>
            {!verified && (
              <p className="text-xs text-gray-500 mt-0.5">+{bonus} reputation points</p>
            )}
          </div>
        </div>

        {verified ? (
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <Badge variant="success">Verified</Badge>
          </div>
        ) : (
          <button
            onClick={() => setShowModal(true)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all ${
              isEmail
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            Verify Now
          </button>
        )}
      </div>

      {showModal && (
        <VerificationModal
          type={type}
          address={address}
          onSuccess={handleSuccess}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

const ReputationPage = () => {
  const { account } = useWeb3();
  const { reputation, loading, refetch } = useReputation(account);

  if (!account) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="warning">
          Please connect your wallet to view your reputation
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!reputation) {
    return (
      <EmptyState
        title="No reputation data"
        description="Complete your first transaction to start building your reputation"
      />
    );
  }

  const data = reputation.data;
  const score = reputation.score;

  const totalLoans = parseInt(data.successfulRepayments || 0) + parseInt(data.defaults || 0);
  const successRate = totalLoans > 0
    ? ((data.successfulRepayments / totalLoans) * 100).toFixed(1)
    : 0;

  const emailVerified = data.emailVerified;
  const phoneVerified = data.phoneVerified;
  const verifiedCount = (emailVerified ? 1 : 0) + (phoneVerified ? 1 : 0);
  const potentialBoost = (!emailVerified ? 30 : 0) + (!phoneVerified ? 70 : 0);

  const MAX_DAILY_GAIN = 50;
  const remainingCap = parseInt(reputation.remainingDailyCap ?? MAX_DAILY_GAIN);
  const gainedToday = parseInt(data.reputationGainedToday ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reputation Profile</h1>
        <p className="text-gray-600">Your on-chain credit score and transaction history</p>
      </div>

      {/* Main Score Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="text-center py-8">
          <ReputationBadge score={score} size="lg" />
          <p className="text-gray-600 mt-4 max-w-2xl mx-auto">
            Your reputation score is calculated based on your transaction history,
            repayment behavior, and overall platform activity.
          </p>

        <DailyCapBar gained={gainedToday/2} remaining={remainingCap} max={MAX_DAILY_GAIN} />
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatBox
          title="Success Rate"
          value={`${successRate}%`}
          subtitle={`${data.successfulRepayments} of ${totalLoans} loans`}
          color="green"
        />
        <StatBox
          title="Total Transactions"
          value={data.totalTransactions?.toString() || '0'}
          subtitle="On-chain transactions"
          color="blue"
        />
        <StatBox
          title="Unique Counterparties"
          value={data.uniqueCounterparties?.toString() || '0'}
          subtitle="Trading partners"
          color="purple"
        />
        <StatBox
          title="Default Rate"
          value={totalLoans > 0 ? `${((data.defaults / totalLoans) * 100).toFixed(1)}%` : '0%'}
          subtitle={`${data.defaults} defaults`}
          color={data.defaults > 0 ? 'red' : 'green'}
        />
      </div>

      {/* ── Identity Verification Section ─────────────────────────────────── */}
      <Card>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Identity Verification
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Verify your identity to boost your reputation score
            </p>
          </div>

          {/* Progress badge */}
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
            verifiedCount === 2
              ? 'bg-green-100 text-green-700'
              : verifiedCount === 1
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {verifiedCount}/2 verified
          </div>
        </div>

        {/* Potential boost banner — only show if something is unverified */}
        {potentialBoost > 0 && (
          <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
            <span className="text-amber-500 text-xl">⚡</span>
            <p className="text-sm text-amber-800">
              Complete verification to unlock up to{' '}
              <span className="font-bold">+{potentialBoost} reputation points</span>
            </p>
          </div>
        )}

        <div className="space-y-3">
          <VerificationCard
            type="email"
            verified={emailVerified}
            address={account}
            onVerified={refetch}
          />
          <VerificationCard
            type="phone"
            verified={phoneVerified}
            address={account}
            onVerified={refetch}
          />
        </div>

        {/* All verified state */}
        {verifiedCount === 2 && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <p className="text-sm text-green-800 font-medium">
              Identity fully verified! You&apos;ve received the maximum verification bonus.
            </p>
          </div>
        )}
      </Card>
      {/* ─────────────────────────────────────────────────────────────────── */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repayment History */}
        <Card>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            Loan History
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Successful Repayments</span>
              <span className="font-semibold text-green-600">{data.successfulRepayments}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Total Repaid</span>
              <span className="font-semibold">{formatCurrency(data.totalRepaymentValue || 0, 4)} ETH</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Defaults</span>
              <span className={`font-semibold ${data.defaults > 0 ? 'text-red-600' : 'text-gray-700'}`}>{data.defaults}</span>
            </div>
            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Total Defaulted</span>
              <span className="font-semibold text-red-500">{formatCurrency(data.totalDefaultValue || 0, 4)} ETH</span>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Overall Success Rate</span>
                <span className="font-semibold">{successRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-600 h-3 rounded-full transition-all"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Activity Metrics */}
        <Card>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Activity Metrics
          </h2>
          <div className="space-y-3">
            <MetricRow label="Total Transactions" value={data.totalTransactions?.toString() || '0'} />
            <MetricRow label="Unique Counterparties" value={data.uniqueCounterparties?.toString() || '0'} />
            <MetricRow label="Total Value Transferred" value={`${formatCurrency(data.totalValueTransferred || 0, 4)} ETH`} />
            <MetricRow label="Wallet Creation" value={formatDate(data.walletCreationTime)} />
            <MetricRow label="Last Activity" value={formatTimeAgo(data.lastActivityTimestamp)} />
          </div>
        </Card>
      </div>

      <Card className="bg-purple-50 border-2 border-purple-200">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-purple-900">Co-signing</h3>
            <p className="text-sm text-purple-700">
              Co-signing bonuses are permanently applied to your base score when a co-signed loan is matched.
            </p>
          </div>
        </div>
      </Card>

      {/* How to Improve */}
      <Card className="bg-blue-50">
        <h2 className="text-xl font-semibold mb-4">How to Improve Your Reputation</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TipCard
            icon="✅"
            title="Complete Repayments On Time"
            description="Timely loan repayments are the fastest way to boost your score"
          />
          <TipCard
            icon="🤝"
            title="Engage with Co-signers"
            description="Build trust relationships through co-signing to gain bonus points"
          />
          <TipCard
            icon="📧"
            title="Verify Your Identity"
            description={`Email (+30 pts) and phone (+70 pts) verification add credibility`}
          />
          <TipCard
            icon="💼"
            title="Increase Transaction Volume"
            description="More successful transactions demonstrate reliability"
          />
        </div>
      </Card>
    </div>
  );
};

// ─── Helper Components ─────────────────────────────────────────────────────────

const StatBox = ({ title, value, subtitle, color }) => {
  const colors = {
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Card className={`${colors[color]} border-2 text-center`}>
      <p className="text-sm font-medium mb-2">{title}</p>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-xs opacity-75">{subtitle}</p>
    </Card>
  );
};

const MetricRow = ({ label, value }) => (
  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
    <span className="text-sm text-gray-600">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);

const TipCard = ({ icon, title, description }) => (
  <div className="flex gap-3 p-4 bg-white rounded-lg">
    <div className="text-2xl">{icon}</div>
    <div>
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  </div>
);

const DailyCapBar = ({ gained, remaining, max }) => {
  const usedPercent = Math.min((gained / max) * 100, 100);
  const isFull = remaining === 0;
  const isUntouched = gained === 0;

  return (
    <div className="mt-6 max-w-sm mx-auto text-left">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Daily Reputation Cap
        </span>
        <span className={`text-xs font-semibold ${isFull ? 'text-orange-600' : 'text-gray-700'}`}>
          {gained} / {max} pts used today
        </span>
      </div>

      {/* Track */}
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFull
              ? 'bg-orange-400'
              : usedPercent > 60
              ? 'bg-yellow-400'
              : 'bg-emerald-400'
          }`}
          style={{ width: `${usedPercent}%` }}
        />
      </div>

      {/* Subtext */}
      <p className="text-xs text-gray-400 mt-1.5 text-center">
        {isFull
          ? 'Cap reached — resets in next 24h window'
          : isUntouched
          ? `Up to +${max} pts available today`
          : `+${remaining} pts remaining today`}
      </p>
    </div>
  );
};

export default ReputationPage;