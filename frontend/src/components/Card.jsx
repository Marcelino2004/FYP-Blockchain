import React from 'react';

export const Card = ({ children, className = '', hover = false, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl shadow-md p-6 ${hover ? 'hover:shadow-lg transition-shadow cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;