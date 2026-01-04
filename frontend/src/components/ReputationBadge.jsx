import React from 'react';

export const ReputationBadge = ({ score, showLabel = true, size = 'md', className = '' }) => {
  const getLevel = (score) => {
    const numScore = Number(score);
    if (numScore < 200) return { label: 'Poor', color: 'bg-red-100 text-red-800', ring: 'ring-red-300' };
    if (numScore < 400) return { label: 'Fair', color: 'bg-orange-100 text-orange-800', ring: 'ring-orange-300' };
    if (numScore < 600) return { label: 'Good', color: 'bg-yellow-100 text-yellow-800', ring: 'ring-yellow-300' };
    if (numScore < 800) return { label: 'Very Good', color: 'bg-blue-100 text-blue-800', ring: 'ring-blue-300' };
    return { label: 'Excellent', color: 'bg-green-100 text-green-800', ring: 'ring-green-300' };
  };

  const level = getLevel(score);
  
  const sizes = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`rounded-full font-semibold ring-2 ${level.color} ${level.ring} ${sizes[size]}`}>
        {score}
      </span>
      {showLabel && (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-900">{level.label}</span>
          <span className="text-xs text-gray-500">Reputation</span>
        </div>
      )}
    </div>
  );
};

export default ReputationBadge;