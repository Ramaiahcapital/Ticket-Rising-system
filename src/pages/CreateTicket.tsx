import { useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Send, Loader2, ImageIcon, XCircle } from "lucide-react";

type FieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
};

export default function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const utils = trpc.useUtils();
  const { data: formConfig } = trpc.ticket.getFormConfig.useQuery(
    { role: (user as any)?.branchRole ?? undefined },
    { enabled: (user as any)?.type === "branch" }
  );
  const { data: portalEnabledMap } = trpc.ticket.getPortalEnabled.useQuery(
    undefined,
    { enabled: (user as any)?.type === "branch" }
  );

  const formConfigData = Array.isArray(formConfig) ? formConfig[0] : formConfig;
  const portalEnabled = portalEnabledMap?.[(user as any)?.branchRole as string] ?? true;
  const fields: FieldDef[] = formConfigData?.fields ?? [];
  const filesEnabled = formConfigData?.filesEnabled ?? true;

  // Subject is derived from the first custom field configured by the admin
  const subject = (() => {
    const first = fields[0];
    if (!first) return "";
    const v = customValues[first.id];
    if (v === undefined || v === null) return "";
    return Array.isArray(v) ? v.join(", ").trim() : String(v).trim();
  })();

  // Compress image to ≤ 1MB using Canvas API
  async function compressImage(file: File, maxBytes = 1_000_000): Promise<Blob> {
    if (!file.type.startsWith("image/")) return file;
    if (file.size <= maxBytes) return file;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let quality = 0.85;
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) { reject(new Error("Compression failed")); return; }
              if (blob.size <= maxBytes || quality <= 0.1) {
                resolve(blob);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            "image/jpeg",
            quality
          );
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  }

  const recordAttachment = trpc.ticket.recordAttachment.useMutation();

  const createTicket = trpc.ticket.create.useMutation({
    onSuccess: async (data) => {
      if (files.length > 0) {
        setIsUploading(true);
        try {
          for (const file of files) {
            const compressed = await compressImage(file);
            const ext = file.name.split(".").pop() || "jpg";
            const fileName = `${data.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("ticket-attachments")
              .upload(fileName, compressed, { contentType: file.type, upsert: false });
            if (uploadError) throw uploadError;
            await recordAttachment.mutateAsync({
              ticketId: data.id,
              fileName: file.name,
              fileType: file.type,
              fileSize: compressed.size,
              filePath: fileName,
            });
          }
        } catch (err: any) {
          setErrors({ form: err.message || "Upload failed" });
          setIsUploading(false);
          return;
        }
      }
      utils.ticket.list.invalidate();
      utils.dashboard.branchStats.invalidate();
      utils.dashboard.adminStats.invalidate();
      navigate(`/tickets/${data.id}`);
    },
    onError: (err) => {
      setErrors({ form: err.message });
    },
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (description.length < 20) newErrors.description = "Description must be at least 20 characters";
    if (!subject) {
      const first = fields[0];
      if (first) {
        newErrors[`custom_${first.id}`] = `${first.label} is required (used as the ticket subject)`;
      } else {
        newErrors.form = "Add at least one custom field to create a ticket (the first field is used as the subject)";
      }
    }
    for (const f of fields) {
      if (!f.required) continue;
      const v = customValues[f.id];
      const empty =
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0);
      if (empty) newErrors[`custom_${f.id}`] = `${f.label} is required`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || createTicket.isPending) return;
    createTicket.mutate({
      subject,
      description,
      customFields: customValues,
    });
  };

  const renderCustomField = (f: FieldDef) => {
    const value = customValues[f.id];
    const err = errors[`custom_${f.id}`];
    const common = `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors ${err ? "border-red-300" : "border-gray-300"}`;
    if (f.type === "text") {
      return <input className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValues({ ...customValues, [f.id]: e.target.value })} placeholder={f.placeholder} />;
    }
    if (f.type === "textarea") {
      return <textarea rows={3} className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValues({ ...customValues, [f.id]: e.target.value })} placeholder={f.placeholder} />;
    }
    if (f.type === "select") {
      return (
        <select className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValues({ ...customValues, [f.id]: e.target.value })}>
          <option value="">Select…</option>
          {(f.options ?? []).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === "radio") {
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {(f.options ?? []).map((o, i) => (
            <label key={i} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name={f.id} checked={value === o} onChange={() => setCustomValues({ ...customValues, [f.id]: o })} className="text-red-600" />
              {o}
            </label>
          ))}
        </div>
      );
    }
    if (f.type === "checkbox") {
      const arr = (value as string[]) ?? [];
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {(f.options ?? []).map((o, i) => (
            <label key={i} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked ? [...arr, o] : arr.filter((x) => x !== o);
                  setCustomValues({ ...customValues, [f.id]: next });
                }}
                className="text-red-600 rounded"
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate("/tickets")}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tickets
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Create New Ticket</h1>
        <p className="text-sm text-gray-500 mt-1">Submit a new support request to the Head Office</p>
      </div>

      {errors.form && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {errors.form}
        </div>
      )}

      {!portalEnabled && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <XCircle className="w-10 h-10 text-gray-300" />
          <h2 className="mt-3 text-lg font-semibold text-gray-700">Ticket portal is disabled</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">The administrator has not enabled ticket creation for your role yet.</p>
        </div>
      )}

      {portalEnabled && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* Custom Fields (configurable per role) — first field becomes the ticket subject */}
            {fields.length > 0 && (
              <div className="space-y-5 pt-1">
                {fields.map((f, fi) => (
                  <div key={f.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
                      {fi === 0 && <span className="ml-2 text-[10px] font-normal text-gray-400">(used as ticket subject)</span>}
                    </label>
                    {renderCustomField(f)}
                    {errors[`custom_${f.id}`] && (
                      <p className="text-xs text-red-600 mt-1">{errors[`custom_${f.id}`]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide detailed information about the issue..."
                rows={6}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors resize-none ${
                  errors.description ? "border-red-300" : "border-gray-300"
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.description && <p className="text-xs text-red-600">{errors.description}</p>}
                <p className="text-xs text-gray-400 ml-auto">{description.length} characters</p>
              </div>
            </div>

            {/* File Attachments (configurable per role) — images only, max 2MB, auto-compressed to ≤1MB */}
            {filesEnabled && (
              <div className="pt-1">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Attachments <span className="text-xs text-gray-400 font-normal">(images, max 2MB each)</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files ?? []);
                      const valid = selected.filter(f => {
                        if (!f.type.startsWith("image/")) { setErrors(prev => ({ ...prev, files: "Only image files are allowed" })); return false; }
                        if (f.size > 2 * 1024 * 1024) { setErrors(prev => ({ ...prev, files: `${f.name} exceeds 2MB limit` })); return false; }
                        return true;
                      });
                      setFiles(valid);
                      if (valid.length > 0) setErrors(prev => { const { files, ...rest } = prev; return rest; });
                    }}
                    className="hidden"
                    id="ticket-files"
                  />
                  <label htmlFor="ticket-files" className="flex flex-col items-center gap-1 cursor-pointer text-gray-500 hover:text-red-600">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-xs">Click to select images (will be compressed to ≤1MB)</span>
                  </label>
                  {errors.files && <p className="text-xs text-red-600 mt-1 text-center">{errors.files}</p>}
                  {files.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {files.map((file, i) => (
                        <div key={i} className="relative group bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                          <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-20 object-cover" />
                          <div className="p-1.5">
                            <p className="text-[10px] text-gray-600 truncate">{file.name}</p>
                            <p className="text-[9px] text-gray-400">{(file.size / 1024).toFixed(0)}KB</p>
                          </div>
                          <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate("/tickets")}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTicket.isPending || isUploading}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {createTicket.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Submit Ticket
              </button>
            </div>
          </div>
        </form>

        {/* Preview / Tips */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Ticket Preview</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subject:</span>
                <span className="text-gray-800 truncate max-w-[180px]">{subject || "-"}</span>
              </div>
              <p className="text-[10px] text-gray-400">Subject is auto-filled from the first custom field</p>
              {fields.length > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-xs text-gray-500 mb-1">Custom fields: {fields.length}</p>
                  <ul className="space-y-1">
                    {fields.map(f => (
                      <li key={f.id} className="flex justify-between text-xs">
                        <span className="text-gray-500">{f.label}:</span>
                        <span className="text-gray-700">{customValues[f.id] ? String(customValues[f.id]).substring(0, 20) : <span className="text-gray-400">-</span>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
            <h3 className="font-semibold text-amber-800 mb-2 text-sm">Tips for faster resolution</h3>
            <ul className="space-y-1.5 text-xs text-amber-700">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                Be specific about the issue
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                Include relevant account numbers
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                Attach screenshots if applicable
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                Mention any error messages
              </li>
            </ul>
          </div>
        </div>
      </div>
      }
    </div>
  );
}
