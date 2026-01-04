import React from 'react';
import Card from './Card';

export const StatCard = ({ title, value, icon, trend, trendValue, loading = false, className = '' }) => {
  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-200 animate-pulse rounded"></div>
          ) : (
            <p className="text-3xl font-bold text-gray-900">{value}</p>
          )}
          {trend && trendValue && !loading && (
            <div className={`mt-2 flex items-center text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              <svg className={`h-4 w-4 mr-1 ${trend === 'down' ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">{trendValue}</span>
              <span className="ml-1 text-gray-600">vs last period</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default StatCard;