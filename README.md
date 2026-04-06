# Wonder Aqua LTD Management System

A comprehensive, enterprise-grade business management system built for water bottling and distribution operations. Designed for real-world use in environments with variable connectivity, such as Kenya.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [User Roles & Permissions](#user-roles--permissions)
- [Branch Data Isolation](#branch-data-isolation)
- [Offline Mode](#offline-mode)
- [Subscription & Billing](#subscription--billing)
- [Security](#security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

Wonder Aqua LTD Management System is a full-stack Progressive Web App (PWA) that manages every aspect of a water bottling business — from production tracking and inventory management to sales, cash submissions, and subscription billing.

**Key Highlights:**
- 🏢 Multi-branch support with strict data isolation
- 👥 Role-Based Access Control (RBAC) with 4 roles
- 📶 Offline-first architecture with auto-sync
- 💳 Subscription billing with grace period handling
- 📊 Real-time dashboards and reporting
- 📱 Installable PWA for mobile and desktop

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | Real-time KPIs: revenue, profit, stock levels, sales trends |
| **Inventory** | Product management with bale/pack/bottle tracking |
| **Sales** | Point-of-sale with discounts, payment modes (Cash, M-Pesa, Credit) |
| **Purchases** | Supplier procurement with auto stock updates |
| **Customers** | Customer profiles, credit tracking, loyalty points |
| **Suppliers** | Supplier directory and purchase history |
| **Production** | Daily production records: bales, bottles, allocation |
| **Cash Submission** | End-of-shift cash reconciliation for cashiers |
| **Targets** | Sales and revenue targets with reward/consequence tracking |
| **Assets** | Company asset register with depreciation tracking |
| **Vouchers** | Expense voucher management |
| **Teams** | Staff management, role assignment, branch assignment |
| **Branches** | Multi-location management |
| **Reports** | Sales, inventory, profit, and transaction reports |
| **Subscription** | Monthly billing with Paystack integration |
| **System Control** | Superadmin settings, countdowns, system configuration |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite 5 |
| **Styling** | Tailwind CSS 3 + shadcn/ui components |
| **State** | React Context + TanStack React Query |
| **Backend** | Lovable Cloud (Supabase) |
| **Database** | PostgreSQL with Row-Level Security |
| **Auth** | Email/password with OTP verification |
| **Payments** | Paystack integration |
| **Offline** | IndexedDB (idb) + sync queue |
| **PWA** | Web App Manifest + smart install prompt |
| **Deployment** | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 18+ or Bun
- A Lovable Cloud project (auto-configured)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd wonder-aqua

# Install dependencies
npm install
# or
bun install

# Start development server
npm run dev
```

### Build for Production

```bash
npm run build
npm run preview
```

---

## Environment Variables

These are auto-configured by Lovable Cloud:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Backend API URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public API key |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier |

> ⚠️ Never expose service role keys in frontend code.

---

## User Roles & Permissions

| Role | Permissions |
|---|---|
| **Superadmin** | Full system access. Manage users, roles, branches, subscriptions, system settings. |
| **Supervisor** | Branch oversight. View all data, approve stock adjustments, manage teams. |
| **Stock Manager** | Inventory control. Add/edit products, record production, manage stock per branch. |
| **Cashier** | Point-of-sale. Create sales, manage assigned-branch customers, submit cash. |

### Role Assignment Flow
1. User signs up → profile created with `pending` status
2. Superadmin approves the user and assigns role(s)
3. Superadmin assigns user to a branch
4. User gains access based on role + branch

---

## Branch Data Isolation

The system enforces strict branch-level data separation:

- **Superadmin/Supervisor**: Global view with branch selector dropdown. Can filter by any branch or view all.
- **Stock Manager**: Must select a branch before adding/adjusting inventory.
- **Cashier**: Automatically locked to their assigned branch. Cannot see other branches' data.

All records (sales, customers, products, etc.) are tagged with `branch_id` on creation.

---

## Offline Mode

The system works in low/no connectivity environments:

### How It Works
1. When offline, actions (sales, customer creation, etc.) are saved to **IndexedDB**
2. A sync queue tracks all pending actions with `is_synced` flags
3. When connectivity returns, the system **auto-syncs** all queued records
4. Visual indicators show current status:
   - 🟢 **ONLINE** — fully connected
   - 🔴 **OFFLINE** — data saved locally
   - 🟡 **SYNCING** — pushing queued data

### Supported Offline Operations
- Creating sales
- Adding customers
- Cash submissions

---

## Subscription & Billing

Monthly subscription system for service continuity:

| Status | Behavior |
|---|---|
| ✅ **Active** | Full access, green badge |
| ⚠️ **Warning** | Due within 7 days, yellow banner |
| 🟠 **Grace** | Past due, limited access for grace period |
| 🔴 **Expired** | Sales, inventory, production locked |

### Configuration (Superadmin only)
- Subscription amount (default: KES 1,000)
- Billing cycle (monthly)
- Grace period (default: 7 days)
- Paystack public key for payments

---

## Security

- **Row-Level Security (RLS)** on every table
- **Security definer functions** for role checks (`has_role`, `is_admin`)
- **OTP email verification** for signup and password reset
- **Branch isolation** prevents cross-branch data access
- **RBAC enforcement** at both UI and database level
- **No anonymous signups** — all users must verify email
- **Auto-session refresh** with stale state cleanup

---

## Deployment

### Vercel (Recommended)

1. Connect repository to Vercel
2. Framework: Vite
3. Build command: `npm run build`
4. Output directory: `dist`
5. Environment variables are auto-configured

### Custom Domain
Configure in Vercel dashboard → Settings → Domains.

The `vercel.json` includes SPA rewrites:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| **Blank screen after login** | Clear browser cache and localStorage, then reload |
| **"Request timeout" errors** | Check internet connection; system retries automatically (2x) |
| **Data not showing** | Verify branch selection; cashiers only see their branch |
| **Can't create sale** | Check subscription status; expired subscriptions lock sales |
| **OTP not received** | Check spam folder; wait 60s before resending |
| **PWA not installing** | Only works on published URL, not in editor preview |
| **Offline data not syncing** | Ensure you're back online; check the sync indicator |
| **Permission denied** | Contact superadmin to verify your role and branch assignment |

---

## License

Proprietary — Wonder Aqua LTD. All rights reserved.
