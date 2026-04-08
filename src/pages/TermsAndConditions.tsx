import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import logo from "@/assets/logo.jpg";

export default function TermsAndConditions() {
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
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Terms & Conditions</h1>
          </div>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">By accessing and using the Wonder Aqua LTD Management System ("the System"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you must not use the System.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. User Accounts</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>You must provide accurate and complete information during registration</li>
              <li>You are responsible for maintaining the confidentiality of your login credentials</li>
              <li>Account access is granted upon approval by a Superadmin or Supervisor</li>
              <li>Each user is assigned a specific role (Superadmin, Supervisor, Cashier, Stock Manager) with corresponding permissions</li>
              <li>Sharing login credentials is strictly prohibited</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. User Responsibilities</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Enter accurate sales, inventory, and financial data</li>
              <li>Report any system errors, discrepancies, or security concerns immediately</li>
              <li>Use the system only for authorized business operations</li>
              <li>Not attempt to access data or features beyond your assigned role</li>
              <li>Not attempt to bypass security controls or data isolation</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Subscription & Payment Terms</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>The System operates on a monthly subscription basis</li>
              <li>Subscription fees are billed monthly and must be paid by the due date</li>
              <li>A grace period may be provided after the due date, during which limited functionality remains available</li>
              <li>Failure to pay after the grace period will result in system access restrictions</li>
              <li>Payments are processed through authorized payment gateways (Paystack, M-Pesa)</li>
              <li>All payment records are maintained for audit purposes</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Data Ownership</h2>
            <p className="text-muted-foreground leading-relaxed">All business data entered into the System (sales records, customer information, inventory data, financial records) remains the property of Wonder Aqua LTD. The system developer and hosting provider act as data processors only.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. System Availability</h2>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>We strive for 99.9% uptime but do not guarantee uninterrupted service</li>
              <li>The System includes offline mode for continued operation during connectivity issues</li>
              <li>Scheduled maintenance will be communicated in advance when possible</li>
              <li>We are not liable for data loss due to force majeure events</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">Wonder Aqua LTD and its system developers shall not be held liable for:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1">
              <li>Financial losses resulting from incorrect data entry by users</li>
              <li>Business decisions made based on system-generated reports</li>
              <li>Temporary service interruptions beyond our control</li>
              <li>Unauthorized access resulting from user negligence (e.g., shared passwords)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">We reserve the right to suspend or terminate user accounts for violation of these terms, non-payment of subscription fees, or any activity that compromises system integrity or security.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">These Terms and Conditions are governed by the laws of the Republic of Kenya. Any disputes shall be resolved through arbitration in accordance with Kenyan law.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Contact</h2>
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
