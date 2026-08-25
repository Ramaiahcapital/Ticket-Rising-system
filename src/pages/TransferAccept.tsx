import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";

export default function TransferAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const { data, isLoading } = trpc.ticket.byTransferToken.useQuery(
    { token: token! },
    { enabled: !!token }
  );

  useEffect(() => {
    if (isLoading) return;
    if (data?.ticketId) {
      navigate(`/tickets/${data.ticketId}`, { replace: true });
    } else if (!data) {
      setError("Invalid or expired transfer link.");
    }
  }, [isLoading, data, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-500">Loading transfer...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Transfer Not Found</h1>
          <p className="text-slate-600 mb-6">{error}</p>
          <button onClick={() => navigate("/login")} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return null;
}
