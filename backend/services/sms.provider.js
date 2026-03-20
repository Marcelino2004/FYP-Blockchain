/**
 * sms.provider.js
 *
 * Sends OTP SMS via Twilio (https://twilio.com).
 * Free trial: ~$15 credit, enough for ~500 SMS messages.
 *
 * Setup:
 *   1. Sign up at https://twilio.com/try-twilio
 *   2. From the Console Dashboard, grab:
 *        - Account SID  (starts with AC...)
 *        - Auth Token
 *   3. Get a free phone number: Console → Phone Numbers → Get a Number
 *   4. Add to backend/.env:
 *        TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *        TWILIO_AUTH_TOKEN=your_auth_token
 *        TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
 *
 * Trial account note: On a free trial you can only send to numbers you've
 * verified in the Twilio console (Console → Verified Caller IDs).
 * Upgrade to a paid account to send to any number.
 */

class SmsProvider {
  constructor() {
    this.client = null;
    this.from = process.env.TWILIO_PHONE_NUMBER;
    this.appName = process.env.APP_NAME || "DeFi Lending";
  }

  _getClient() {
    if (this.client) return this.client;

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return null;

    // Lazy-load so server starts even if twilio isn't installed yet
    try {
      const twilio = require("twilio");
      this.client = twilio(sid, token);
      return this.client;
    } catch {
      return null;
    }
  }

  isConfigured() {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );
  }

  async send(to, otp, expiryMinutes = 10) {
    const client = this._getClient();

    if (!client || !this.from) {
      // Dev fallback — print to terminal
      this._logToConsole(to, otp, expiryMinutes);
      return { dev: true };
    }

    const message = await client.messages.create({
      body: `Your ${this.appName} verification code is: ${otp}\n\nExpires in ${expiryMinutes} minutes. Do not share this code.`,
      from: this.from,
      to,
    });

    console.log(`📱 SMS sent to ${to} (sid: ${message.sid})`);
    return { sid: message.sid };
  }

  _logToConsole(to, otp, expiryMinutes) {
    console.log("\n" + "─".repeat(55));
    console.log("📱  [DEV - no Twilio credentials] Phone OTP");
    console.log(`    To      : ${to}`);
    console.log(`    OTP     : \x1b[32m\x1b[1m${otp}\x1b[0m`);
    console.log(`    Expires : ${expiryMinutes} minutes`);
    console.log("─".repeat(55) + "\n");
  }
}

module.exports = new SmsProvider();
