import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Send, Loader2, ImageIcon, XCircle, Users } from "lucide-react";

type FieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
  dependsOn?: { fieldId: string; value: string };
};

/** Fields are visible unless their parent select/radio answer doesn't match. */
function getVisibleFields(fields: FieldDef[], values: Record<string, unknown>): FieldDef[] {
  return fields.filter((f) => {
    if (!f.dependsOn) return true;
    return values[f.dependsOn.fieldId] === f.dependsOn.value;
  });
}

export default function CreateTicket() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeRoles, getColor } = useBranchRoles();
  const [selectedRole, setSelectedRole] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);

  const utils = trpc.useUtils();

  // Default the role picker to the user's saved role, else the first active role
  useEffect(() => {
    if (activeRoles.length === 0) return;
    setSelectedRole((prev) => {
      if (prev && activeRoles.some((r) => r.name === prev)) return prev;
      const saved = (user as any)?.branchRole as string | undefined;
      if (saved && activeRoles.some((r) => r.name === saved)) return saved;
      return activeRoles[0].name;
    });
  }, [activeRoles, user]);

  const { data: formConfig } = trpc.ticket.getFormConfig.useQuery(
    { role: selectedRole || undefined },
    { enabled: (user as any)?.type === "branch" && !!selectedRole }
  );
  const { data: portalEnabledMap } = trpc.ticket.getPortalEnabled.useQuery(
    undefined,
    { enabled: (user as any)?.type === "branch" }
  );

  const formConfigData = Array.isArray(formConfig) ? formConfig[0] : formConfig;
  const portalEnabled = selectedRole ? (portalEnabledMap?.[selectedRole] ?? true) : false;
  const allFields: FieldDef[] = formConfigData?.fields ?? [];
  const filesEnabled = formConfigData?.filesEnabled ?? true;

  // Only fields whose condition is satisfied are shown
  const fields = getVisibleFields(allFields, customValues);

  // Clear answers to now-hidden fields whenever a parent answer changes
  const setCustomValue = (id: string, value: unknown) => {
    const next = { ...customValues, [id]: value };
    const visible = new Set(getVisibleFields(allFields, next).map((f) => f.id));
    const pruned: Record<string, unknown> = {};
    for (const k of Object.keys(next)) {
      if (visible.has(k)) pruned[k] = next[k];
    }
    setCustomValues(pruned);
    setErrors((prev) => {
      const nextErrors = { ...prev };
      for (const k of Object.keys(nextErrors)) {
        if (k.startsWith("custom_") && !visible.has(k.replace("custom_", ""))) {
          delete nextErrors[k];
        }
      }
      return nextErrors;
    });
  };

  // Subject character limit (applied to the form input and server validation)
  const SUBJECT_MAX = 50;

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
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) newErrors.subject = "Subject is required";
    else if (trimmedSubject.length > SUBJECT_MAX) newErrors.subject = `Subject must be ${SUBJECT_MAX} characters or less`;
    if (description.length < 20) newErrors.description = "Description must be at least 20 characters";
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
    if (!selectedRole) { setErrors({ form: "Select your role" }); return; }
    if (!validate() || createTicket.isPending) return;
    createTicket.mutate({
      subject,
      description,
      branchRole: selectedRole,
      customFields: customValues,
    });
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    setCustomValues({});
    setErrors({});
  };

  const renderCustomField = (f: FieldDef) => {
    const value = customValues[f.id];
    const err = errors[`custom_${f.id}`];
    const common = `w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors ${err ? "border-red-300" : "border-gray-300"}`;
    if (f.type === "text") {
      return <input className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValue(f.id, e.target.value)} placeholder={f.placeholder} />;
    }
    if (f.type === "textarea") {
      return <textarea rows={3} className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValue(f.id, e.target.value)} placeholder={f.placeholder} />;
    }
    if (f.type === "select") {
      return (
        <select className={common} value={(value as string) ?? ""} onChange={(e) => setCustomValue(f.id, e.target.value)}>
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
              <input type="radio" name={f.id} checked={value === o} onChange={() => setCustomValue(f.id, o)} className="text-red-600" />
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
                  setCustomValue(f.id, next);
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

      {/* Role selection (decides the admin bucket + form fields) */}
      {activeRoles.length > 0 && (
        <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Select Your Role <span className="text-red-500">*</span>
            <span className="ml-2 text-xs font-normal text-gray-400">Your ticket will be routed to this department</span>
          </label>
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors appearance-none"
            >
              {activeRoles.map((r) => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>
            {selectedRole && (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getColor(selectedRole) }} />
              </span>
            )}
            <Users className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
      )}

      {!selectedRole && (
        <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        </div>
      )}

      {selectedRole && !portalEnabled && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200">
          <XCircle className="w-10 h-10 text-gray-300" />
          <h2 className="mt-3 text-lg font-semibold text-gray-700">Ticket portal is disabled</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">The administrator has not enabled ticket creation for the selected role ({selectedRole || "none"}) yet. Choose another role above.</p>
        </div>
      )}

      {selectedRole && portalEnabled && <div className="max-w-3xl">
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            {/* Subject — fixed, always first, compulsory, with character limit */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Subject <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={subject}
                maxLength={SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter a short summary of the issue"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors ${
                  errors.subject ? "border-red-300" : "border-gray-300"
                }`}
              />
              <div className="flex justify-between mt-1">
                {errors.subject && <p className="text-xs text-red-600">{errors.subject}</p>}
                <p className={`text-xs ml-auto ${subject.length >= SUBJECT_MAX ? "text-red-600" : "text-gray-400"}`}>
                  {subject.length}/{SUBJECT_MAX}
                </p>
              </div>
            </div>

            {/* Custom Fields (configurable per role) */}
            {fields.length > 0 && (
              <div className="space-y-5 pt-1">
                {fields.map((f) => (
                  <div key={f.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {f.label} {f.required && <span className="text-red-500">*</span>}
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
                  Attachments <span className="text-xs text-gray-400 font-normal">(up to 5 images, max 2MB each)</span>
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
                      if (valid.length > 5) {
                        setErrors(prev => ({ ...prev, files: "Maximum 5 images allowed per ticket" }));
                        setFiles(valid.slice(0, 5));
                      } else {
                        setFiles(valid);
                        if (valid.length > 0) setErrors(prev => { const { files, ...rest } = prev; return rest; });
                      }
                    }}
                    className="hidden"
                    id="ticket-files"
                  />
                  <label htmlFor="ticket-files" className="flex flex-col items-center gap-1 cursor-pointer text-gray-500 hover:text-red-600">
                    <ImageIcon className="w-5 h-5" />
                    <span className="text-xs">Click to select up to 5 images (compressed to ≤1MB)</span>
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
      </div>
      }
    </div>
  );
}
