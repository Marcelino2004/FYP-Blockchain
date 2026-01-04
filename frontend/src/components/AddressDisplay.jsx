import React, { useState } from 'react';
import { formatAddress } from '../utils/formatters';

export const AddressDisplay = ({ address, showCopy = true, shortened = true, className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <code className="text-sm font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
        {shortened ? formatAddress(address) : address}
      </code>
      {showCopy && (
        <button
          onClick={handleCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          title={copied ? 'Copied!' : 'Copy address'}
        >
          {copied ? (
            <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
};

export default AddressDisplay;