import logo from "@/assets/logo.jpg";

export function generateSystemManual() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Wonder Aqua LTD - System Manual</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; color: #1a1a2e; line-height: 1.7; }
    @page { margin: 2cm; }
    @media print { .no-print { display: none; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .page-break { page-break-before: always; } }

    .cover { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: linear-gradient(135deg, #0a1628 0%, #0d3b66 50%, #1a7f8f 100%); color: white; padding: 60px 40px; }
    .cover img { width: 120px; height: 120px; border-radius: 24px; object-fit: cover; border: 4px solid rgba(255,255,255,0.3); margin-bottom: 30px; }
    .cover h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; }
    .cover h2 { font-size: 22px; font-weight: 400; opacity: 0.85; margin-bottom: 40px; }
    .cover .meta { font-size: 14px; opacity: 0.65; }
    .cover .badge { background: rgba(255,255,255,0.15); padding: 8px 20px; border-radius: 20px; font-size: 13px; margin-top: 16px; display: inline-block; }

    .content { max-width: 700px; margin: 0 auto; padding: 40px 30px; }
    h2 { font-size: 24px; font-weight: 700; color: #0d3b66; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 3px solid #1a7f8f; }
    h3 { font-size: 18px; font-weight: 600; color: #1a1a2e; margin: 24px 0 10px; }
    p { margin-bottom: 12px; color: #444; }
    ul { margin: 8px 0 16px 24px; color: #444; }
    li { margin-bottom: 6px; }
    .role-card { background: #f0f9ff; border-left: 4px solid #1a7f8f; padding: 16px 20px; margin: 12px 0; border-radius: 0 8px 8px 0; }
    .role-card h4 { font-weight: 700; color: #0d3b66; margin-bottom: 4px; }
    .role-card p { font-size: 14px; margin-bottom: 0; }
    .warning { background: #fef3cd; border-left: 4px solid #f0ad4e; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 12px 0; }
    .tip { background: #d4edda; border-left: 4px solid #28a745; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 12px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th { background: #0d3b66; color: white; padding: 10px 14px; text-align: left; }
    td { padding: 8px 14px; border-bottom: 1px solid #e5e5e5; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { text-align: center; padding: 30px; color: #888; font-size: 12px; border-top: 1px solid #eee; margin-top: 40px; }
    .print-btn { position: fixed; top: 20px; right: 20px; background: #0d3b66; color: white; padding: 12px 24px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; z-index: 100; font-weight: 600; }
    .print-btn:hover { background: #1a7f8f; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save as PDF</button>

  <div class="cover">
    <img src="${logo}" alt="Wonder Aqua" />
    <h1>WONDER AQUA LTD</h1>
    <h2>Management System Manual</h2>
    <p class="meta">Version 2.0 · ${today}</p>
    <p class="badge">www.wonderaqua.co.ke</p>
    <p class="meta" style="margin-top:40px;">Confidential — For Authorized Personnel Only</p>
    <p class="meta" style="margin-top:8px;">Developed by Titus W. Ngari — Jenga Systems</p>
  </div>

  <div class="content page-break">
    <h2>1. System Overview</h2>
    <p>The Wonder Aqua LTD Management System is a comprehensive water distribution management platform designed for real-world business operations. It provides complete sales tracking, inventory management, financial reporting, and multi-branch operations from a single dashboard.</p>
    <p>Key capabilities:</p>
    <ul>
      <li>Real-time sales and profit tracking</li>
      <li>Multi-branch inventory management with data isolation</li>
      <li>Role-based access control (RBAC) for security</li>
      <li>Offline mode with automatic data synchronization</li>
      <li>Professional invoice generation</li>
      <li>Subscription and billing management</li>
    </ul>

    <h2>2. Getting Started</h2>
    <h3>2.1 Logging In</h3>
    <p>Navigate to <strong>www.wonderaqua.co.ke</strong> and click "Sign In". Enter your registered email and password. After entering credentials, you will receive a 6-digit OTP code via email for security verification.</p>

    <h3>2.2 First-Time Registration</h3>
    <p>Click "Get Started" or "Create Account". Fill in your full name, phone number, email, and create a password (minimum 6 characters). After registration, your account will require approval by a Superadmin or Supervisor before you can access the system.</p>

    <h3>2.3 Password Reset</h3>
    <p>If you forget your password, click "Forgot Password" on the login page. Enter your email to receive an OTP verification code, then set a new password with strength validation.</p>

    <h2>3. User Roles & Permissions</h2>
    <p>The system uses strict Role-Based Access Control (RBAC) to ensure data security and proper access levels.</p>

    <div class="role-card">
      <h4>🔑 Superadmin</h4>
      <p>Full system control. Can manage all data, users, branches, settings, subscriptions, and system configuration. Has visibility across all branches.</p>
    </div>
    <div class="role-card">
      <h4>👔 Supervisor</h4>
      <p>Administrative access to sales, inventory, reports, customers, purchases, and team management. Can view all branches. Cannot access System Control or subscription management.</p>
    </div>
    <div class="role-card">
      <h4>💰 Cashier</h4>
      <p>Transaction-focused role. Can record sales, manage customers, submit cash reconciliations. Locked to assigned branch only. Cannot edit inventory or view reports.</p>
    </div>
    <div class="role-card">
      <h4>📦 Stock Manager</h4>
      <p>Inventory-focused role. Manages stock levels, production records, and purchases. Must select a target branch before operations. View-only access for customers.</p>
    </div>

    <table>
      <tr><th>Module</th><th>Superadmin</th><th>Supervisor</th><th>Cashier</th><th>Stock Mgr</th></tr>
      <tr><td>Dashboard</td><td>✅ Full</td><td>✅ Full</td><td>✅ Limited</td><td>✅ Limited</td></tr>
      <tr><td>Sales</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td></tr>
      <tr><td>Inventory</td><td>✅ Edit</td><td>✅ Edit</td><td>👁️ View</td><td>✅ Edit</td></tr>
      <tr><td>Purchases</td><td>✅</td><td>✅</td><td>❌</td><td>✅</td></tr>
      <tr><td>Customers</td><td>✅</td><td>✅</td><td>✅</td><td>❌</td></tr>
      <tr><td>Reports</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
      <tr><td>Teams</td><td>✅</td><td>✅</td><td>❌</td><td>❌</td></tr>
      <tr><td>System Control</td><td>✅</td><td>❌</td><td>❌</td><td>❌</td></tr>
    </table>

    <h2 class="page-break">4. Sales Management</h2>
    <p>Navigate to <strong>Sales</strong> from the sidebar to record new sales transactions.</p>
    <ul>
      <li>Select the product, enter quantity, and choose payment mode (Cash, Mpesa, or Credit)</li>
      <li>Optionally select a customer for credit tracking and loyalty points</li>
      <li>Apply discounts (fixed amount or percentage)</li>
      <li>Profit is calculated automatically (selling price - buying price × quantity)</li>
      <li>Sales are tagged to the active branch automatically</li>
    </ul>
    <div class="tip"><strong>💡 Tip:</strong> Use the customer search to quickly find returning customers and track their purchase history.</div>

    <h2>5. Inventory Management</h2>
    <p>The inventory module tracks water bottle stock across all branches.</p>
    <ul>
      <li><strong>Products:</strong> Add water products with bottle size, buying/selling price, and stock threshold</li>
      <li><strong>Bales & Packs:</strong> Track inventory in bales, packs, and individual bottles</li>
      <li><strong>Low Stock Alerts:</strong> Products below threshold appear on the dashboard</li>
      <li><strong>Stock Adjustments:</strong> Request increases/decreases with admin approval workflow</li>
    </ul>

    <h2>6. Production Records</h2>
    <p>Record daily production output including total bottles, good/faulty counts, bale allocation, and economy/executive bottle splits. Each record is linked to a branch and includes expected revenue calculation.</p>

    <h2>7. Customer Management</h2>
    <ul>
      <li>Add customers with name, phone, email, and address</li>
      <li>Track credit balances and loyalty points</li>
      <li>View complete purchase history per customer</li>
      <li>Generate professional invoices for customers with outstanding debt</li>
      <li>Filter by customer type (Regular, Loyalty, With Debt)</li>
    </ul>

    <h2>8. Cash Submission</h2>
    <p>Cashiers submit daily cash reconciliation at end of shift:</p>
    <ul>
      <li>Enter cash, M-Pesa, and credit amounts separately</li>
      <li>Add notes for any discrepancies</li>
      <li>Submissions are validated by supervisors/admins</li>
    </ul>

    <h2 class="page-break">9. Multi-Branch Operations</h2>
    <p>The system supports multiple branch locations with strict data isolation:</p>
    <ul>
      <li><strong>Superadmin/Supervisor:</strong> Use the branch selector in the sidebar to switch between branches or view "All Branches"</li>
      <li><strong>Cashiers:</strong> Automatically locked to their assigned branch — no selector shown</li>
      <li><strong>Stock Managers:</strong> Must select a target branch before creating records</li>
      <li>All data (sales, inventory, customers) is automatically tagged with the correct branch</li>
    </ul>
    <div class="warning"><strong>⚠️ Important:</strong> Data is strictly isolated between branches. A cashier in Branch A cannot see or modify Branch B data.</div>

    <h2>10. Reports & Analytics</h2>
    <p>Available to Superadmin and Supervisors:</p>
    <ul>
      <li>Revenue vs Purchases (7-day trend)</li>
      <li>Payment method breakdown (Cash/Mpesa/Credit pie chart)</li>
      <li>Stock levels bar chart</li>
      <li>Monthly summary with profit tracking</li>
      <li>Performance analysis comparing expected vs actual profit</li>
    </ul>

    <h2>11. Subscription & Billing</h2>
    <p>The system includes a monthly subscription tracker:</p>
    <ul>
      <li>Tracks subscription status: Active, Warning, Grace, Expired</li>
      <li>Configurable grace period after due date</li>
      <li>Payment via Paystack integration</li>
      <li>System restrictions activate upon expiration</li>
      <li>Visibility controlled by Superadmin (Cashiers/Stock Managers never see subscription info)</li>
    </ul>

    <h2>12. System Control (Superadmin Only)</h2>
    <ul>
      <li><strong>Subscription Visibility:</strong> Toggle whether supervisors can see subscription status</li>
      <li><strong>Paystack Configuration:</strong> Set payment gateway public key</li>
      <li><strong>M-Pesa Credentials:</strong> Securely store Daraja API credentials</li>
      <li><strong>System Countdown:</strong> Set a countdown timer that restricts operations at zero</li>
      <li><strong>Data Reset:</strong> Irreversible deletion of specific data categories (requires "RESET" confirmation)</li>
    </ul>

    <h2>13. Offline Mode</h2>
    <p>The system works without internet connectivity:</p>
    <ul>
      <li>Sales and customer records are saved locally using IndexedDB</li>
      <li>A sync queue stores all offline actions</li>
      <li>When connectivity returns, data is automatically pushed to the server</li>
      <li>Status indicator shows: 🟢 Online, 🔴 Offline, 🟡 Syncing</li>
    </ul>
    <div class="tip"><strong>💡 Tip:</strong> The system is designed for low-connectivity environments. You can continue recording sales even with no internet.</div>

    <h2 class="page-break">14. Security Measures</h2>
    <ul>
      <li>OTP-based email verification for login and signup</li>
      <li>Password strength validation</li>
      <li>Role-Based Access Control at application level</li>
      <li>Row-Level Security (RLS) at database level</li>
      <li>Branch data isolation preventing cross-branch data leakage</li>
      <li>Encrypted storage for payment credentials</li>
      <li>Double-entry prevention with transaction IDs</li>
    </ul>

    <h2>15. Troubleshooting</h2>
    <table>
      <tr><th>Issue</th><th>Solution</th></tr>
      <tr><td>Can't log in</td><td>Check email/password. Use "Forgot Password" to reset. Ensure your account is approved.</td></tr>
      <tr><td>"Access Denied" error</td><td>Your role doesn't have permission for that module. Contact your supervisor.</td></tr>
      <tr><td>Data not appearing</td><td>Check your branch selection. You may be viewing a different branch.</td></tr>
      <tr><td>Offline indicator showing</td><td>Check internet connection. Data will auto-sync when reconnected.</td></tr>
      <tr><td>System expired</td><td>Subscription needs renewal. Contact superadmin.</td></tr>
      <tr><td>Payment not processing</td><td>Ensure Paystack key is configured in System Control.</td></tr>
    </table>

    <div class="footer">
      <p><strong>Wonder Aqua LTD Management System</strong></p>
      <p>www.wonderaqua.co.ke</p>
      <p style="margin-top:8px;">Developed by Titus W. Ngari — Jenga Systems</p>
      <p>© ${new Date().getFullYear()} Wonder Aqua LTD. All rights reserved.</p>
      <p style="margin-top:12px; font-style:italic;">This document is confidential and intended for authorized personnel only.</p>
    </div>
  </div>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
}
