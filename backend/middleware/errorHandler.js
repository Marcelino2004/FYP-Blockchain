function errorHandler(err, req, res, next) {
  console.error("Error:", err);

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Handle specific error types
  if (err.code === "CALL_EXCEPTION") {
    statusCode = 400;
    message =
      "Blockchain call failed: " + (err.reason || "Invalid contract call");
  }

  if (err.code === "NETWORK_ERROR") {
    statusCode = 503;
    message = "Blockchain network unavailable";
  }

  // Send error response
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

module.exports = errorHandler;
