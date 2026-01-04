const cors = require("cors");
const config = require("../config");

const corsOptions = {
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

module.exports = cors(corsOptions);
