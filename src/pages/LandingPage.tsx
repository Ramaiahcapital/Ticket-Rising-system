import { useState } from "react";
import { useNavigate } from "react-router";
import { LogIn, Shield, Users, FileText, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  const features = [
    { icon: ClipboardList, title: "Ticket Management", desc: "Create, assign, track and resolve support tickets across branches with full audit trails." },
    { icon: Users, title: "Multi-Branch Support", desc: "Centralized management for multiple branches with role-based access for admins, managers, and IT staff." },
    { icon: Shield, title: "Role-Based Access", desc: "Granular permissions with main admin, sub-admin, branch, and cluster roles to control who sees what." },
    { icon: FileText, title: "Stationary Orders", desc: "Branches can request stationary through an approval workflow routed to cluster and admin teams." },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Logo"
              className="h-8 w-auto"
              onError={(e) => {
                const el = e.currentTarget;
                if (el.src.endsWith("/logo.png")) el.src = "/logo.jpg";
                else if (el.src.endsWith("/logo.jpg")) el.src = "/logo.webp";
              }}
            />
            <div>
              <span className="text-sm font-bold text-gray-800">Ramaiah Capital</span>
              <span className="hidden sm:inline text-xs text-gray-400 ml-2">TMS</span>
            </div>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
          backgroundSize: "50px 50px"
        }} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center relative">
          <div className="inline-block bg-red-50 text-red-600 text-xs font-semibold px-3 py-1 rounded-full mb-5 border border-red-100">
            Internal Use Only
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold text-gray-900 leading-tight">
            Ticket Management<br />System
          </h1>
          <p className="mt-5 text-gray-500 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            A centralized platform for Ramaiah Capital to manage support tickets,
            branch communications, and stationary requests — all in one place.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              onClick={() => navigate("/login")}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-7 py-3 rounded-lg transition-colors flex items-center gap-2 text-sm"
            >
              <LogIn className="w-4 h-4" />
              Sign In to Continue
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center">What You Can Do</h2>
          <p className="text-gray-500 text-sm text-center mt-2 mb-10">Built for internal teams to stay organized and responsive.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center mb-3">
                  <f.icon className="w-4.5 h-4.5 text-red-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800">{f.title}</h3>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center">About This System</h2>
          <div className="max-w-2xl mx-auto mt-5 text-sm text-gray-600 leading-relaxed space-y-3">
            <p>
              The Ramaiah Capital Ticket Management System (TMS) is an internal tool designed to streamline
              support operations across all branches. It enables efficient ticket routing, real-time
              tracking, and structured communication between branch staff, IT teams, and management.
            </p>
            <p>
              Access to this system is restricted to authorized Ramaiah Capital employees only.
              Each user is assigned a role that determines their permissions and the features they can access.
              If you believe you should have access, please contact your administrator.
            </p>
          </div>
        </div>
      </section>

      {/* Terms & Privacy */}
      <section className="bg-gray-50 border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-6">Legal</h2>

          <CollapsibleSection title="Terms and Conditions">
            <div className="space-y-3">
              <p><strong>1. Authorized Use Only</strong> — This system is exclusively for authorized Ramaiah Capital employees. Unauthorized access is strictly prohibited and may result in disciplinary action.</p>
              <p><strong>2. Account Responsibility</strong> — You are responsible for maintaining the confidentiality of your login credentials. Do not share your password with anyone.</p>
              <p><strong>3. Acceptable Use</strong> — Use the system only for legitimate work-related purposes. Do not submit false, misleading, or abusive content through tickets or comments.</p>
              <p><strong>4. Data Ownership</strong> — All data submitted through this system belongs to Ramaiah Capital. The organization reserves the right to review, audit, and retain all system data.</p>
              <p><strong>5. System Availability</strong> — While we strive for continuous availability, Ramaiah Capital does not guarantee uninterrupted access. Scheduled maintenance windows may apply.</p>
              <p><strong>6. Modifications</strong> — Ramaiah Capital reserves the right to modify, update, or discontinue the system or these terms at any time without prior notice.</p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Privacy Policy">
            <div className="space-y-3">
              <p><strong>1. Data Collected</strong> — The system collects your name, email, role, and activity data (tickets created, comments made, actions taken) for operational purposes.</p>
              <p><strong>2. Data Usage</strong> — Your data is used solely for ticket management, reporting, and internal communication within Ramaiah Capital.</p>
              <p><strong>3. Data Sharing</strong> — Your data is not shared with third parties. It is accessible only to authorized Ramaiah Capital personnel based on their role and permissions.</p>
              <p><strong>4. Data Retention</strong> — System data is retained as long as necessary for operational and audit purposes. Contact your administrator for data-related requests.</p>
              <p><strong>5. Security</strong> — We employ industry-standard security measures including encrypted connections (HTTPS) and role-based access controls to protect your data.</p>
              <p><strong>6. Contact</strong> — For privacy-related inquiries, contact your system administrator or the IT department at Ramaiah Capital.</p>
            </div>
          </CollapsibleSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Ramaiah Capital. All rights reserved.</p>
          <p className="text-xs text-gray-400">Internal Use Only &middot; Not for Public Access</p>
        </div>
      </footer>
    </div>
  );
}
