import { useNavigate } from "react-router";
import { LogIn, Shield, Users, FileText, ClipboardList } from "lucide-react";
// v2

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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-6">Legal</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate("/terms")}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-white rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-sm transition-all group"
            >
              <FileText className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">Terms and Conditions</p>
                <p className="text-xs text-gray-400">Usage rules and policies</p>
              </div>
            </button>
            <button
              onClick={() => navigate("/privacy")}
              className="flex items-center justify-center gap-2 px-6 py-4 bg-white rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-sm transition-all group"
            >
              <Shield className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
              <div className="text-left">
                <p className="text-sm font-semibold text-gray-800">Privacy Policy</p>
                <p className="text-xs text-gray-400">How your data is handled</p>
              </div>
            </button>
          </div>
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
