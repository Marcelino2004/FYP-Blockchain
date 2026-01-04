const database = {
  // PostgreSQL configuration (example)
  postgres: {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || "lending_platform",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  },

  // Redis configuration (for caching)
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || "",
    db: process.env.REDIS_DB || 0,
  },

  // Cache TTL settings (in seconds)
  cacheTTL: {
    reputation: 60, // 1 minute
    loans: 30, // 30 seconds
    prices: 60, // 1 minute
    collateral: 45, // 45 seconds
    platformStats: 300, // 5 minutes
  },
};

module.exports = database;
