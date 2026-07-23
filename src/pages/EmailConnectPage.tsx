import GoogleConnect from "@/components/GoogleConnect";

export default function EmailConnectPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Email Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">Connect your Google account so emails are sent from your Gmail when you create tickets</p>
      </div>
      <GoogleConnect />
    </div>
  );
}
