import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-sm font-bold text-gray-800">Ramaiah Capital</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. Data We Collect</h2>
            <p>The system collects your name, email address, role, and activity data (tickets created, comments made, stationary orders placed, and actions taken) for operational purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. How We Use Your Data</h2>
            <p>Your data is used solely for ticket management, stationary ordering, reporting, and internal communication within Ramaiah Capital. We do not use your data for any purpose beyond the scope of this system.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. Data Sharing</h2>
            <p>Your data is not shared with third parties. It is accessible only to authorized Ramaiah Capital personnel based on their role and permissions within the system.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. Data Retention</h2>
            <p>System data is retained as long as necessary for operational and audit purposes. Contact your administrator or the IT department for data-related requests, including corrections or deletion.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. Security Measures</h2>
            <p>We employ industry-standard security measures including encrypted connections (HTTPS), role-based access controls, and secure authentication to protect your data from unauthorized access.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">6. Cookies and Sessions</h2>
            <p>The system uses session tokens to maintain your login state. These are stored locally in your browser and are cleared when you log out. No third-party tracking cookies are used.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. Your Rights</h2>
            <p>You have the right to request access to your personal data stored in the system, request corrections, or ask for your data to be removed. Contact your system administrator or the IT department to exercise these rights.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. Contact</h2>
            <p>For privacy-related inquiries, contact your system administrator or the IT department at Ramaiah Capital.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100">
          <button onClick={() => navigate("/")} className="text-sm text-red-600 hover:text-red-700 font-medium">← Return to Home</button>
        </div>
      </main>
    </div>
  );
}
