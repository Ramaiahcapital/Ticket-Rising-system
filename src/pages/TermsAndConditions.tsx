import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

export default function TermsAndConditions() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Terms and Conditions</h1>
        <p className="text-xs text-gray-400 mb-8">Last updated: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>

        <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. Authorized Use Only</h2>
            <p>This system is exclusively for authorized Ramaiah Capital employees. Unauthorized access is strictly prohibited and may result in disciplinary action. By using this system, you confirm that you are an authorized representative of Ramaiah Capital.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. Account Responsibility</h2>
            <p>You are responsible for maintaining the confidentiality of your login credentials. Do not share your password with anyone. You must immediately report any suspected unauthorized use of your account to the IT department.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. Acceptable Use</h2>
            <p>Use the system only for legitimate work-related purposes. Do not submit false, misleading, or abusive content through tickets, comments, or stationary orders. Any misuse of the system may result in restricted access and appropriate action.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. Data Ownership</h2>
            <p>All data submitted through this system belongs to Ramaiah Capital. The organization reserves the right to review, audit, and retain all system data, including tickets, comments, stationary orders, and user activity logs.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. System Availability</h2>
            <p>While we strive for continuous availability, Ramaiah Capital does not guarantee uninterrupted access to the system. Scheduled maintenance windows may apply, and advance notice will be provided where possible.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">6. Modifications</h2>
            <p>Ramaiah Capital reserves the right to modify, update, or discontinue the system or these terms at any time without prior notice. Continued use of the system after any modifications constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. Limitation of Liability</h2>
            <p>Ramaiah Capital shall not be held liable for any loss, damage, or disruption arising from the use or inability to use this system. The system is provided "as is" for internal operational purposes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. Governing Terms</h2>
            <p>These terms are governed by the internal policies of Ramaiah Capital. Any disputes arising from the use of this system shall be resolved in accordance with the organization's internal governance framework.</p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-100">
          <button onClick={() => navigate("/")} className="text-sm text-red-600 hover:text-red-700 font-medium">← Return to Home</button>
        </div>
      </main>
    </div>
  );
}
