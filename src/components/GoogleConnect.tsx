import { trpc } from "@/providers/trpc";
import { Mail, CheckCircle2, Unlink, Loader2, ExternalLink } from "lucide-react";

export default function GoogleConnect() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.googleAuth.status.useQuery();
  const { data: authUrl } = trpc.googleAuth.authUrl.useQuery();
  const disconnect = trpc.googleAuth.disconnect.useMutation({
    onSuccess: () => utils.googleAuth.status.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading email settings...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-800">Email Notifications</h3>
          <p className="text-xs text-gray-500">Connect your Google account to send email notifications automatically</p>
        </div>
      </div>

      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Connected</p>
              <p className="text-xs text-green-600">{status.email}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Emails will be sent from this address when you create tickets, orders, or approve requests.
          </p>
          <button
            onClick={() => { if (confirm("Disconnect your Google account? Emails will stop sending.")) disconnect.mutate(); }}
            disabled={disconnect.isPending}
            className="flex items-center gap-2 px-3 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {disconnect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Connect your Google account so that notifications are sent <strong>from your email address</strong> to the relevant recipients.
          </p>
          <a
            href={authUrl?.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Connect Google Account
          </a>
          <p className="text-[10px] text-gray-400">
            You'll be redirected to Google to authorize email sending permissions.
          </p>
        </div>
      )}
    </div>
  );
}
