const crypto = require("crypto");
const blockchainService = require("./blockchain.service");
const contractLoader = require("../config/contracts");
const emailProvider = require("./email.provider");
const smsProvider = require("./sms.provider");
const { ethers } = require("ethers");

// In-memory OTP store: { key: { otp, expiresAt, address, type, attempts } }
// In production, swap this Map for Redis to survive restarts and scale horizontally.
const otpStore = new Map();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;
const RATE_LIMIT_MS = 60 * 1000; // 1 OTP request per minute per address+type

const rateLimitStore = new Map();

class VerificationService {
  /**
   * Call once at server startup. Logs clearly if the signer or role is misconfigured.
   */
  async checkVerifierRole() {
    console.log("\n🔍 Checking VERIFIER_ROLE configuration...");

    const signerAddress = contractLoader.getSignerAddress();
    if (!signerAddress) {
      console.error(
        "❌ VERIFIER_PRIVATE_KEY is not set in backend/.env\n" +
          "   Verification write calls will fail.\n" +
          "   Add: VERIFIER_PRIVATE_KEY=<your private key> to backend/.env",
      );
      return false;
    }

    try {
      const contract = blockchainService.getContract("reputationManager");
      const VERIFIER_ROLE = await contract.VERIFIER_ROLE();
      const hasRole = await contract.hasRole(VERIFIER_ROLE, signerAddress);

      if (hasRole) {
        console.log(`✅ Backend signer (${signerAddress}) has VERIFIER_ROLE`);
      } else {
        console.error(
          `❌ Backend signer (${signerAddress}) does NOT have VERIFIER_ROLE\n\n` +
            `   Run this once to fix it:\n\n` +
            `   BACKEND_WALLET=${signerAddress} npx hardhat run scripts/grant-verifier-role.js --network localhost\n`,
        );
      }

      // Also log provider status
      console.log(
        `📧 Email provider  : ${emailProvider.isConfigured() ? "Resend ✅" : "console fallback (set RESEND_API_KEY)"}`,
      );
      console.log(
        `📱 SMS provider    : ${smsProvider.isConfigured() ? "Twilio ✅" : "console fallback (set TWILIO_* vars)"}`,
      );

      return hasRole;
    } catch (err) {
      console.error("❌ Could not check VERIFIER_ROLE:", err.message);
      return false;
    }
  }

  // ─── OTP helpers ──────────────────────────────────────────────────────────

  _generateOTP() {
    const bytes = crypto.randomBytes(4);
    const num = bytes.readUInt32BE(0) % 1_000_000;
    return num.toString().padStart(OTP_LENGTH, "0");
  }

  _makeKey(address, type) {
    return `${address.toLowerCase()}:${type}`;
  }

  _checkRateLimit(address, type) {
    const key = this._makeKey(address, type);
    const last = rateLimitStore.get(key);
    if (last && Date.now() - last < RATE_LIMIT_MS) {
      const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - last)) / 1000);
      throw Object.assign(
        new Error(`Please wait ${waitSec}s before requesting another OTP`),
        { statusCode: 429 },
      );
    }
    rateLimitStore.set(key, Date.now());
  }

  // ─── Send Email OTP ────────────────────────────────────────────────────────

  async sendEmailOTP(address, email) {
    if (!ethers.isAddress(address)) {
      throw Object.assign(new Error("Invalid wallet address"), {
        statusCode: 400,
      });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Object.assign(new Error("Invalid email address"), {
        statusCode: 400,
      });
    }

    await this._checkNotAlreadyVerified(address, "email");
    this._checkRateLimit(address, "email");

    const otp = this._generateOTP();
    otpStore.set(this._makeKey(address, "email"), {
      otp,
      email,
      address,
      type: "email",
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
    });

    await emailProvider.send(email, otp, OTP_EXPIRY_MS / 60000);

    return {
      success: true,
      message: emailProvider.isConfigured()
        ? "Verification code sent to your email"
        : "OTP generated — check your backend terminal (no RESEND_API_KEY set)",
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      maskedEmail: this._maskEmail(email),
    };
  }

  // ─── Send Phone OTP ────────────────────────────────────────────────────────

  async sendPhoneOTP(address, phone) {
    if (!ethers.isAddress(address)) {
      throw Object.assign(new Error("Invalid wallet address"), {
        statusCode: 400,
      });
    }
    const cleanPhone = phone.replace(/[\s\-()]/g, "");
    if (!cleanPhone || !/^\+?[1-9]\d{6,14}$/.test(cleanPhone)) {
      throw Object.assign(
        new Error(
          "Invalid phone number. Use international format e.g. +6512345678",
        ),
        { statusCode: 400 },
      );
    }

    await this._checkNotAlreadyVerified(address, "phone");
    this._checkRateLimit(address, "phone");

    const otp = this._generateOTP();
    otpStore.set(this._makeKey(address, "phone"), {
      otp,
      phone: cleanPhone,
      address,
      type: "phone",
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
    });

    await smsProvider.send(cleanPhone, otp, OTP_EXPIRY_MS / 60000);

    return {
      success: true,
      message: smsProvider.isConfigured()
        ? "Verification code sent via SMS"
        : "OTP generated — check your backend terminal (no Twilio credentials set)",
      expiresInSeconds: OTP_EXPIRY_MS / 1000,
      maskedPhone: this._maskPhone(cleanPhone),
    };
  }

  // ─── Verify OTP & Write to Chain ──────────────────────────────────────────

  async verifyOTP(address, type, otp) {
    if (!ethers.isAddress(address)) {
      throw Object.assign(new Error("Invalid wallet address"), {
        statusCode: 400,
      });
    }
    if (!["email", "phone"].includes(type)) {
      throw Object.assign(new Error("Invalid verification type"), {
        statusCode: 400,
      });
    }
    if (!otp || otp.length !== OTP_LENGTH) {
      throw Object.assign(new Error("OTP must be 6 digits"), {
        statusCode: 400,
      });
    }

    const key = this._makeKey(address, type);
    const record = otpStore.get(key);

    if (!record) {
      throw Object.assign(
        new Error("No pending verification found. Please request a new OTP."),
        { statusCode: 400 },
      );
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      throw Object.assign(
        new Error("OTP has expired. Please request a new one."),
        { statusCode: 400 },
      );
    }

    record.attempts += 1;
    if (record.attempts > MAX_ATTEMPTS) {
      otpStore.delete(key);
      throw Object.assign(
        new Error("Too many failed attempts. Please request a new OTP."),
        { statusCode: 429 },
      );
    }

    if (record.otp !== otp) {
      const remaining = MAX_ATTEMPTS - record.attempts;
      throw Object.assign(
        new Error(`Incorrect OTP. ${remaining} attempt(s) remaining.`),
        { statusCode: 400 },
      );
    }

    otpStore.delete(key);

    try {
      await this._recordVerificationOnChain(address, type);
    } catch (err) {
      if (err.message?.includes("AlreadyVerified")) {
        return {
          success: true,
          alreadyVerified: true,
          message: `${type} already verified on-chain`,
        };
      }
      throw Object.assign(
        new Error(`On-chain verification failed: ${err.message}`),
        { statusCode: 500 },
      );
    }

    const bonusPoints = type === "email" ? 30 : 70;
    return {
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} verified! +${bonusPoints} reputation points added.`,
      bonusPoints,
      verificationType: type,
    };
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async getVerificationStatus(address) {
    if (!ethers.isAddress(address)) {
      throw Object.assign(new Error("Invalid wallet address"), {
        statusCode: 400,
      });
    }
    try {
      const contract = blockchainService.getContract("reputationManager");
      const data = await contract.getReputationData(address);
      return {
        address,
        emailVerified: data.emailVerified,
        phoneVerified: data.phoneVerified,
        pendingEmail: otpStore.has(this._makeKey(address, "email")),
        pendingPhone: otpStore.has(this._makeKey(address, "phone")),
      };
    } catch {
      return {
        address,
        emailVerified: false,
        phoneVerified: false,
        pendingEmail: false,
        pendingPhone: false,
      };
    }
  }

  // u2500u2500u2500 Dev Reset (local Hardhat only) u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500

  async devReset(address, type = "both") {
    const { ethers: e } = require("ethers");
    if (!e.isAddress(address)) {
      throw Object.assign(new Error("Invalid wallet address"), {
        statusCode: 400,
      });
    }
    const contract = blockchainService.getContract("reputationManager");
    const contractAddress = await contract.getAddress();
    const baseSlot = e.solidityPackedKeccak256(
      ["address", "uint256"],
      [address, 3],
    );
    const fieldSlot = e.toBeHex(BigInt(baseSlot) + BigInt(11), 32);
    const provider = contractLoader.provider;
    const current = await provider.getStorage(contractAddress, fieldSlot);
    const bytes = Buffer.from(current.slice(2), "hex");
    if (type === "email" || type === "both") bytes[31] = 0x00;
    if (type === "phone" || type === "both") bytes[30] = 0x00;
    await provider.send("hardhat_setStorageAt", [
      contractAddress,
      fieldSlot,
      "0x" + bytes.toString("hex"),
    ]);
    if (type === "email" || type === "both") {
      otpStore.delete(this._makeKey(address, "email"));
      rateLimitStore.delete(this._makeKey(address, "email"));
    }
    if (type === "phone" || type === "both") {
      otpStore.delete(this._makeKey(address, "phone"));
      rateLimitStore.delete(this._makeKey(address, "phone"));
    }
    const after = await contract.getReputationData(address);
    console.log(
      `u{1F527} [DEV] Reset verification for ${address}: email=${after.emailVerified}, phone=${after.phoneVerified}`,
    );
    return {
      success: true,
      address,
      type,
      emailVerified: after.emailVerified,
      phoneVerified: after.phoneVerified,
      message: `Reset ${type} verification. Ready to re-verify.`,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  async _checkNotAlreadyVerified(address, type) {
    try {
      const contract = blockchainService.getContract("reputationManager");
      const data = await contract.getReputationData(address);
      if (type === "email" && data.emailVerified) {
        throw Object.assign(new Error("Email is already verified"), {
          statusCode: 400,
        });
      }
      if (type === "phone" && data.phoneVerified) {
        throw Object.assign(new Error("Phone is already verified"), {
          statusCode: 400,
        });
      }
    } catch (err) {
      if (err.statusCode) throw err;
    }
  }

  async _recordVerificationOnChain(address, type) {
    const contract = blockchainService.getContract("reputationManager");
    const tx = await contract.recordOffChainVerification(address, type);
    await tx.wait();
    console.log(
      `On-chain verification recorded: ${address} / ${type} (tx: ${tx.hash})`,
    );
  }

  _maskEmail(email) {
    const [local, domain] = email.split("@");
    return (
      local.slice(0, 2) +
      "*".repeat(Math.max(local.length - 2, 1)) +
      "@" +
      domain
    );
  }

  _maskPhone(phone) {
    return (
      phone.slice(0, 3) +
      "*".repeat(Math.max(phone.length - 5, 4)) +
      phone.slice(-2)
    );
  }
}

module.exports = new VerificationService();
