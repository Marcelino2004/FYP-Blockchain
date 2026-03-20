// frontend/src/services/api.js
import { API_BASE_URL, API_ENDPOINTS } from "../utils/constants";

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // ============ Reputation API ============

  async getReputation(address) {
    return this.request(API_ENDPOINTS.reputation(address));
  }

  async refreshReputation(address) {
    return this.request(`/api/reputation/${address}/refresh`, {
      method: "POST",
    });
  }

  // ============ Verification API ============

  async getVerificationStatus(address) {
    return this.request(`/api/verification/status/${address}`);
  }

  async sendVerificationOTP(address, type, contact) {
    return this.request("/api/verification/send-otp", {
      method: "POST",
      body: JSON.stringify({ address, type, contact }),
    });
  }

  async verifyOTP(address, type, otp) {
    return this.request("/api/verification/verify-otp", {
      method: "POST",
      body: JSON.stringify({ address, type, otp }),
    });
  }

  // ============ Loans API ============

  async getLenderOffers() {
    return this.request(API_ENDPOINTS.lenderOffers);
  }

  async getBorrowerRequests() {
    return this.request(API_ENDPOINTS.borrowerRequests);
  }

  async getUserLoans(address) {
    return this.request(API_ENDPOINTS.userLoans(address));
  }

  async getLoanDetails(loanId) {
    return this.request(API_ENDPOINTS.loanDetails(loanId));
  }

  // ============ Collateral API ============

  async getCollateralTokens() {
    return this.request(API_ENDPOINTS.collateralTokens);
  }

  async getUserCollateral(address) {
    return this.request(API_ENDPOINTS.userCollateral(address));
  }

  async getLoanCollateralValue(loanId) {
    return this.request(API_ENDPOINTS.loanCollateralValue(loanId));
  }

  // ============ Co-signing API ============

  async getCoSigningRequests() {
    return this.request(API_ENDPOINTS.coSigningRequests);
  }

  async getUserCoSignings(address) {
    return this.request(API_ENDPOINTS.userCoSignings(address));
  }

  // ============ Prices API ============

  async getPrices() {
    return this.request(API_ENDPOINTS.prices);
  }

  async getTokenPrice(tokenAddress) {
    return this.request(API_ENDPOINTS.tokenPrice(tokenAddress));
  }

  // ============ Stats API ============

  async getPlatformStats() {
    return this.request(API_ENDPOINTS.platformStats);
  }

  // ============ Health Check ============

  async healthCheck() {
    return this.request(API_ENDPOINTS.health);
  }
}

export default new ApiService();
