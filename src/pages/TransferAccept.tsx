import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "../hooks/useAuth";

type TransferStatus = "pending" | "requested" | "accepted";

export default function TransferAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [transferStatus, setTransferStatus] = useState<TransferStatus | null>(null);
  const [toEmail, setToEmail] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState("");
  const [requesting, setRequesting] = useState(false);

  const byToken = trpc.ticket.byTransferToken.useQuery(
    { token: token! },
    { enabled: !!token }
  );

  const requestAccess = trpc.ticket.requestTransferAccess.useMutation();

  const handledRef = useRef(false);

  // Process transfer status
  useEffect(() => {
    if (byToken.isLoading || authLoading) return;
    if (byToken.error) {
      setError(byToken.error.message);
      setLoading(false);
      return;
    }
    if (!byToken.data) return;

    const data = byToken.data as any;
    setTransferStatus(data.status);
    setToEmail(data.toEmail || "");
    setTicketId(data.ticketId || null);
    setLoading(false);
  }, [byToken.isLoading, authLoading, byToken.error, byToken.data]);

  // If accepted and logged in, verify email and redirect
  useEffect(() => {
    if (transferStatus !== "accepted" || !user || !ticketId || handledRef.current) return;
    handledRef.current = true;

    const userEmail = user.type === "branch" ? user.email : (user as any).email;
    if (userEmail?.toLowerCase().trim() === toEmail.toLowerCase().trim()) {
      navigate(`/tickets/${ticketId}`, { replace: true });
    } else {
      setError(`This transfer is for ${toEmail}. You are logged in as ${userEmail}. Please log out and log in with the correct account.`);
    }
  }, [transferStatus, user, ticketId, toEmail, navigate]);

  const handleRequestAccess = async () => {
    if (!requestEmail.trim()) return;
    setRequesting(true);
    setError("");
    try {
      await requestAccess.mutateAsync({ token: token!, email: requestEmail.trim() });
      setTransferStatus("requested");
    } catch (e: any) {
      setError(e.message || "Failed to send request");
    } finally {
      setRequesting(false);
    }
  };

  if (loading || byToken.isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-500">Loading transfer...</p>
        </div>
      </div>
    );
  }

  if (error && !transferStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Transfer Not Found</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <button onClick={() => navigate("/login")} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // PENDING → Show Request Access form
  if (transferStatus === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Ticket Transfer</h1>
            <p className="text-slate-600">Enter your email to request access to this ticket.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your Email Address</label>
              <input
                type="email"
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleRequestAccess()}
              />
            </div>
            <button
              onClick={handleRequestAccess}
              disabled={requesting || !requestEmail.trim()}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {requesting ? "Sending Request..." : "Request Access"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // REQUESTED → Show waiting message
  if (transferStatus === "requested") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Request Sent</h1>
          <p className="text-slate-600 mb-4">
            Your access request for <strong>{toEmail}</strong> has been sent.
          </p>
          <p className="text-sm text-slate-500">
            The admin will review and grant access. You will receive an email once approved.
          </p>
        </div>
      </div>
    );
  }

  // ACCEPTED → Should have redirected, but show login prompt if email doesn't match
  if (transferStatus === "accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Granted</h1>
          {error ? (
            <p className="text-red-600 mb-4">{error}</p>
          ) : (
            <p className="text-slate-600 mb-4">Loading ticket...</p>
          )}
          <button onClick={() => navigate("/login")} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
}
