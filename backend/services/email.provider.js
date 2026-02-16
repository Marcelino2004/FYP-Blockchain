/**
 * email.provider.js
 *
 * Sends OTP emails via Resend (https://resend.com).
 * Free tier: 3,000 emails/month, no credit card needed.
 *
 * Setup:
 *   1. Sign up at https://resend.com
 *   2. Get your API key from the dashboard
 *   3. Add to backend/.env:
 *        RESEND_API_KEY=re_xxxxxxxxxxxx
 *        EMAIL_FROM=noreply@yourdomain.com
 *
 * Note: On Resend's free plan you can only send FROM addresses on a
 * verified domain. While testing without a domain, use:
 *        EMAIL_FROM=onboarding@resend.dev
 * (Resend provides this address for testing — it works without domain setup)
 */

class EmailProvider {
  constructor() {
    this.resend = null;
    this.from = process.env.EMAIL_FROM || "onboarding@resend.dev";
    this.appName = process.env.APP_NAME || "DeFi Lending Platform";
  }

  _getClient() {
    if (this.resend) return this.resend;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;

    // Lazy-load so server starts even if resend isn't installed yet
    try {
      const { Resend } = require("resend");
      this.resend = new Resend(apiKey);
      return this.resend;
    } catch {
      return null;
    }
  }

  isConfigured() {
    return !!process.env.RESEND_API_KEY;
  }

  async send(to, otp, expiryMinutes = 10) {
    const client = this._getClient();

    if (!client) {
      // Dev fallback — print to terminal
      this._logToConsole(to, otp, expiryMinutes);
      return { dev: true };
    }

    const { data, error } = await client.emails.send({
      from: `${this.appName} <${this.from}>`,
      to,
      subject: `Your verification code: ${otp}`,
      html: this._buildHtml(otp, expiryMinutes),
      text: `Your ${this.appName} verification code is: ${otp}\n\nThis code expires in ${expiryMinutes} minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }

    console.log(`📧 Email sent to ${to} (id: ${data.id})`);
    return data;
  }

  _buildHtml(otp, expiryMinutes) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${this.appName}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Email Verification</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Use the code below to verify your email address. It expires in <strong>${expiryMinutes} minutes</strong>.
              </p>
              <!-- OTP box -->
              <div style="background:#f0f9ff;border:2px solid #bfdbfe;border-radius:10px;padding:24px;text-align:center;margin:0 0 24px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Verification Code</p>
                <p style="margin:0;color:#1d4ed8;font-size:40px;font-weight:800;letter-spacing:10px;font-family:'Courier New',monospace;">${otp}</p>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;">
                If you didn't request this code, you can safely ignore this email. Never share this code with anyone.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                This is an automated message from ${this.appName}. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  _logToConsole(to, otp, expiryMinutes) {
    console.log("\n" + "─".repeat(55));
    console.log("📧  [DEV - no RESEND_API_KEY] Email OTP");
    console.log(`    To      : ${to}`);
    console.log(`    OTP     : \x1b[32m\x1b[1m${otp}\x1b[0m`);
    console.log(`    Expires : ${expiryMinutes} minutes`);
    console.log("─".repeat(55) + "\n");
  }
}

module.exports = new EmailProvider();
