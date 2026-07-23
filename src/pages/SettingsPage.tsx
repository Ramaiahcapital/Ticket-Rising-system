import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Settings, Save, Loader2 } from "lucide-react";
import GoogleConnect from "@/components/GoogleConnect";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.settings.list.useQuery();
  const { data: preview } = trpc.settings.previewTicketNumber.useQuery();
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => utils.settings.list.invalidate() });

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      setForm({ ...(settings as Record<string, string>) });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ settings: form });
  };

  const fields = [
    { key: "company_name", label: "Company Name", type: "text" },
    { key: "company_tagline", label: "Tagline", type: "text" },
    { key: "ticket_number_format", label: "Ticket Number Format", type: "text", help: "Use YYYY for year, XXXXXX for counter" },
    { key: "max_attachment_size", label: "Max Attachment Size (bytes)", type: "number", help: "1048576 = 1MB" },
    { key: "allowed_file_types", label: "Allowed File Types", type: "text", help: "Comma-separated extensions" },
    { key: "items_per_page", label: "Items Per Page", type: "number" },
    { key: "session_timeout_minutes", label: "Session Timeout (minutes)", type: "number" },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure system preferences and defaults</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>
      ) : (
        <>
          {/* Ticket Numbering */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2"><Settings className="w-4 h-4" /> Ticket Numbering</h3>
            <p className="text-xs text-gray-500 mb-4">Next ticket number: <span className="font-mono text-red-600 font-medium">{preview?.preview}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.filter(f => f.key === "ticket_number_format").map(f => (
                <div key={f.key} className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm({...form, [f.key]: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                  {f.help && <p className="text-[10px] text-gray-400 mt-1">{f.help}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Company Branding */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Company Branding</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.filter(f => ["company_name", "company_tagline"].includes(f.key)).map(f => (
                <div key={f.key} className={f.key === "company_tagline" ? "" : "sm:col-span-2"}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm({...form, [f.key]: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Attachment Settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Attachment Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.filter(f => ["max_attachment_size", "allowed_file_types"].includes(f.key)).map(f => (
                <div key={f.key} className={f.key === "allowed_file_types" ? "sm:col-span-2" : ""}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input value={form[f.key] || ""} onChange={e => setForm({...form, [f.key]: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                  {f.help && <p className="text-[10px] text-gray-400 mt-1">{f.help}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* General Settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">General</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.filter(f => ["items_per_page", "session_timeout_minutes"].includes(f.key)).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type="number" value={form[f.key] || ""} onChange={e => setForm({...form, [f.key]: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 outline-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Live Chat */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">Live Chat</h3>
                <p className="text-xs text-gray-500 mt-1">Enable or disable live chat on tickets</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.live_chat_enabled !== "false"}
                  onChange={e => setForm({ ...form, live_chat_enabled: e.target.checked ? "true" : "false" })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {updateSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>
          </div>
        </>
      )}

      <GoogleConnect />
    </div>
  );
}
