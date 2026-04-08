import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield } from "lucide-react";
import logo from "@/assets/logo.jpg";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/"><img src={logo} alt="Wonder Aqua" className="h-8 w-8 rounded-lg object-cover" /></Link>
          <span className="font-bold text-foreground">Wonder Aqua LTD</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center gap-3">
          <Link to="/"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          </div>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">Wonder Aqua LTD ("we", "us", "our") operates the Wonder Aqua Management System at www.wonderaqua.co.ke. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our management platform.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">We collect information that you provide directly to us, including:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Personal identification: full name, email address, phone number</li>
              <li>Authentication credentials: encrypted passwords</li>
              <li>Business data: sales records, inventory data, customer information, financial transactions</li>
              <li>Usage data: login times, feature access patterns, device information</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>To provide and maintain the management system</li>
              <li>To authenticate users and enforce role-based access control</li>
              <li>To process business transactions (sales, purchases, inventory)</li>
              <li>To generate reports and business analytics</li>
              <li>To send subscription and system notifications</li>
              <li>To improve system functionality and user experience</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Data Protection & Security</h2>
            <p className="text-muted-foreground leading-relaxed">We implement robust security measures including:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>End-to-end encryption for sensitive credentials (M-Pesa keys, Paystack keys)</li>
              <li>Role-Based Access Control (RBAC) ensuring data isolation between roles</li>
              <li>Row-Level Security (RLS) at the database level for branch data isolation</li>
              <li>Secure password hashing and OTP-based email verification</li>
              <li>Regular security audits and monitoring</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Data Sharing</h2>
            <p className="text-muted-foreground leading-relaxed">We do not sell, trade, or rent your personal information to third parties. Data may be shared with:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Payment processors (Paystack, M-Pesa) for subscription and transaction processing</li>
              <li>Cloud infrastructure providers for secure data storage</li>
              <li>Law enforcement when required by applicable law</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">We retain your data for as long as your account is active or as needed to provide services. Business records are retained as required by Kenyan tax and business regulations. You may request deletion of your account by contacting the system administrator.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">In accordance with the Kenya Data Protection Act, 2019, you have the right to:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Access your personal data</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Data portability</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">If you have questions about this Privacy Policy, please contact us at:</p>
            <div className="bg-card border rounded-lg p-4 text-sm text-foreground">
              <p className="font-semibold">Wonder Aqua LTD</p>
              <p>Website: www.wonderaqua.co.ke</p>
              <p>Email: info@wonderaqua.co.ke</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
