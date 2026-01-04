class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

class BlockchainError extends AppError {
  constructor(message, originalError) {
    super(message, 500);
    this.originalError = originalError;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  BlockchainError,
};
