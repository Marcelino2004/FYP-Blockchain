require("dotenv").config();

const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || "0.0.0.0",
    env: process.env.NODE_ENV || "development",
  },

  // Blockchain settings
  blockchain: {
    network: "localhost", //process.env.NETWORK ||
    rpcUrl: "http://127.0.0.1:8545", //process.env.RPC_URL ||
    chainId: parseInt("31337"), //process.env.CHAIN_ID ||
    confirmations: parseInt(process.env.CONFIRMATIONS || "1"),
  },

  // API settings
  api: {
    baseUrl: "http://localhost:3001", //process.env.API_BASE_URL ||
    version: "v1",
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
    },
  },

  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },

  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "combined",
  },

  // Cache settings
  cache: {
    enabled: process.env.CACHE_ENABLED === "true",
    ttl: parseInt(process.env.CACHE_TTL || "60"),
  },

  // Frontend URL
  frontend: {
    url: "http://localhost:3000", //process.env.FRONTEND_URL ||
  },
};

// Validate required environment variables
function validateConfig() {
  const required = ["RPC_URL"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && config.server.env === "production") {
    console.warn(`⚠️  Missing environment variables: ${missing.join(", ")}`);
  }
}

validateConfig();

module.exports = config;
