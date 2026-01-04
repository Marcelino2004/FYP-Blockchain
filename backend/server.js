const express = require("express");
const config = require("./config");
const blockchainService = require("./services/blockchain.service");

// Middleware
const corsMiddleware = require("./middleware/cors");
const logger = require("./middleware/logger");
const errorHandler = require("./middleware/errorHandler");

// Routes
const reputationRoutes = require("./routes/reputation.routes");
const loansRoutes = require("./routes/loans.routes");
const collateralRoutes = require("./routes/collateral.routes");
const coSigningRoutes = require("./routes/cosigning.routes");
const pricesRoutes = require("./routes/prices.routes");
const statsRoutes = require("./routes/stats.routes");

const app = express();

// Apply middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(logger);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.server.env,
    network: config.blockchain.network,
  });
});

// API routes
app.use("/api/reputation", reputationRoutes);
app.use("/api/loans", loansRoutes);
app.use("/api/collateral", collateralRoutes);
app.use("/api/cosigning", coSigningRoutes);
app.use("/api/prices", pricesRoutes);
app.use("/api/stats", statsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize and start server
async function startServer() {
  try {
    console.log("\n🚀 Starting Lending Platform Backend...\n");
    console.log("=".repeat(70));

    // Initialize blockchain connection
    console.log("🔗 Connecting to blockchain...");
    await blockchainService.initialize();
    console.log("✅ Blockchain connected\n");

    // Start HTTP server
    app.listen(config.server.port, config.server.host, () => {
      console.log("=".repeat(70));
      console.log(`\n✅ Backend server running!`);
      console.log(
        `📡 API available at http://${config.server.host}:${config.server.port}`
      );
      console.log(
        `💚 Health check: http://localhost:${config.server.port}/health`
      );
      console.log(`🌍 Environment: ${config.server.env}`);
      console.log(`⛓️  Network: ${config.blockchain.network}`);
      console.log(`\n📚 API Endpoints:`);
      console.log(`   GET  /api/reputation/:address`);
      console.log(`   GET  /api/loans/offers/lenders`);
      console.log(`   GET  /api/loans/offers/borrowers`);
      console.log(`   GET  /api/loans/user/:address`);
      console.log(`   GET  /api/loans/:loanId`);
      console.log(`   GET  /api/collateral/tokens`);
      console.log(`   GET  /api/collateral/user/:address`);
      console.log(`   GET  /api/collateral/loan/:loanId/value`);
      console.log(`   GET  /api/cosigning/requests`);
      console.log(`   GET  /api/cosigning/user/:address`);
      console.log(`   GET  /api/prices`);
      console.log(`   GET  /api/prices/:tokenAddress`);
      console.log(`   GET  /api/stats/platform`);
      console.log("\n" + "=".repeat(70) + "\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n👋 SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\n👋 SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Start the server
startServer();
