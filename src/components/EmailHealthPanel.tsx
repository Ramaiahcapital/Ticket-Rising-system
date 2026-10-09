import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  branch: "Branch",
  cluster: "Cluster",
  transfer: "Transfer",
};

export default function EmailHealthPanel() {
  const { isMainAdmin } = useAuth();
  const { data, isLoading } = trpc.googleAuth.health.useQuery(undefined, { enabled: isMainAdmin });

  if (!isMainAdmin) return null;

  const accounts = data?.accounts ?? [];
  const working = accounts.filter((a) => a.healthy).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">Email Delivery Health</h3>
          <p className="text-xs text-gray-500">Google mailboxes used to send notifications. {working} of {accounts.length} working.</p>
        </div>
      </div>

      {data?.systemSender ? (
        <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <p className="text-xs text-indigo-800">
            Fallback mailbox: <strong>{data.systemSender.email}</strong>
            {data.systemSender.name ? ` (${data.systemSender.name})` : ""}. If a sender's own Gmail is unavailable, emails are sent from here.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            No working mailbox found. At least one administrator must reconnect their Google account (Email Settings) for emails to send.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Mailbox</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Last Refreshed</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking mailboxes...</span>
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-gray-500">No Google accounts connected yet.</td>
              </tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.userId} className="border-b border-gray-50">
                  <td className="py-2 px-3 text-sm text-gray-800">
                    {a.email}
                    {data?.systemSender?.email === a.email && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">fallback</span>
                    )}
                    {a.name && <span className="block text-xs text-gray-400">{a.name}</span>}
                  </td>
                  <td className="py-2 px-3 text-sm text-gray-600">{ROLE_LABEL[a.role ?? ""] ?? a.role ?? "-"}</td>
                  <td className="py-2 px-3">
                    {a.healthy ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><CheckCircle2 className="w-3.5 h-3.5" /> Working</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" title={a.reason || ""}>
                        <XCircle className="w-3.5 h-3.5" /> {a.reason || "Broken"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-400">
                    {a.connectedAt ? new Date(a.connectedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
