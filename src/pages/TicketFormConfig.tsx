import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { Plus, Trash2, GripVertical, X, Save, FileText, Type, List, CheckSquare, AlignLeft } from "lucide-react";

type Field = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
};

const FIELD_TYPES: { value: Field["type"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "text", label: "Text Input", icon: Type },
  { value: "textarea", label: "Text Area", icon: AlignLeft },
  { value: "select", label: "Dropdown", icon: List },
  { value: "radio", label: "Radio Buttons", icon: List },
  { value: "checkbox", label: "Checkbox", icon: CheckSquare },
];

export default function TicketFormConfig() {
  const utils = trpc.useUtils();
  const { activeRoles } = useBranchRoles();
  const [activeRole, setActiveRole] = useState<string>("");
  const { data: configs, isLoading } = trpc.ticket.getFormConfig.useQuery();
  const { data: portalEnabledMap } = trpc.ticket.getPortalEnabled.useQuery();
  const upsertConfig = trpc.ticket.upsertFormConfig.useMutation({
    onSuccess: () => utils.ticket.getFormConfig.invalidate(),
  });
  const setPortalEnabled = trpc.ticket.setPortalEnabled.useMutation({
    onSuccess: () => utils.ticket.getPortalEnabled.invalidate(),
  });

  const currentConfig = configs?.find((c: any) => c.role === activeRole);
  const enabled = portalEnabledMap?.[activeRole] ?? true;
  const [fields, setFields] = useState<Field[]>([]);
  const [filesEnabled, setFilesEnabled] = useState(true);
  const [synced, setSynced] = useState<Record<string, boolean>>({});

  // Select the first active role once roles load
  useEffect(() => {
    if (activeRoles.length > 0 && (!activeRole || !activeRoles.some((r) => r.name === activeRole))) {
      setActiveRole(activeRoles[0].name);
      setSynced((prev) => ({ ...prev, [activeRoles[0].name]: false }));
    }
  }, [activeRoles, activeRole]);

  // Sync from server when role changes
  if (currentConfig && !synced[activeRole]) {
    setFields((currentConfig.fields as Field[]) ?? []);
    setFilesEnabled(currentConfig.filesEnabled);
    setSynced((prev) => ({ ...prev, [activeRole]: true }));
  }

  const addField = () => {
    const newField: Field = {
      id: `field_${Date.now()}`,
      label: "",
      type: "text",
      required: false,
      options: [],
      placeholder: "",
      sortOrder: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (id: string, updates: Partial<Field>) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const updated = { ...f, ...updates };
        // Reset options if type changes to text/textarea
        if (updates.type && ["text", "textarea"].includes(updates.type)) {
          updated.options = [];
        }
        return updated;
      })
    );
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const moveField = (id: string, direction: "up" | "down") => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((f, i) => ({ ...f, sortOrder: i }));
    });
  };

  const addOption = (fieldId: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        return { ...f, options: [...(f.options ?? []), ""] };
      })
    );
  };

  const updateOption = (fieldId: string, optIdx: number, value: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const opts = [...(f.options ?? [])];
        opts[optIdx] = value;
        return { ...f, options: opts };
      })
    );
  };

  const removeOption = (fieldId: string, optIdx: number) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const opts = [...(f.options ?? [])];
        opts.splice(optIdx, 1);
        return { ...f, options: opts };
      })
    );
  };

  const handleSave = () => {
    upsertConfig.mutate({
      role: activeRole as any,
      fields: fields.map((f, i) => ({ ...f, sortOrder: i })),
      filesEnabled,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Ticket Form Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Customize ticket fields for each user role</p>
        </div>
      </div>

      {/* Role Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {activeRoles.map((role) => (
          <button
            key={role.id}
            onClick={() => {
              setActiveRole(role.name);
              setSynced((prev) => ({ ...prev, [role.name]: false }));
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeRole === role.name
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {role.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Form Builder */}
          <div className="space-y-4">
            {/* Portal Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Enable Ticket Portal</h3>
                  <p className="text-xs text-gray-500">When off, {activeRole} users cannot create new tickets.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={enabled} onChange={e => setPortalEnabled.mutate({ role: activeRole, enabled: e.target.checked })} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Custom Fields</h3>
                <button
                  onClick={addField}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
                >
                  <Plus className="w-3 h-3" /> Add Field
                </button>
              </div>

              {fields.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                  No custom fields yet. Click "Add Field" to start.
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col gap-1 pt-1">
                          <button
                            onClick={() => moveField(field.id, "up")}
                            disabled={idx === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <GripVertical className="w-3 h-3 rotate-180" />
                          </button>
                          <button
                            onClick={() => moveField(field.id, "down")}
                            disabled={idx === fields.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <GripVertical className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={field.label}
                              onChange={(e) => updateField(field.id, { label: e.target.value })}
                              placeholder="Field label"
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:border-red-500 outline-none"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => updateField(field.id, { type: e.target.value as Field["type"] })}
                              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:border-red-500 outline-none"
                            >
                              {FIELD_TYPES.map((ft) => (
                                <option key={ft.value} value={ft.value}>
                                  {ft.label}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-xs text-gray-600">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => updateField(field.id, { required: e.target.checked })}
                                className="rounded border-gray-300"
                              />
                              Required
                            </label>
                          </div>

                          {["text", "textarea"].includes(field.type) && (
                            <input
                              value={field.placeholder ?? ""}
                              onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                              placeholder="Placeholder text (optional)"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:border-red-500 outline-none"
                            />
                          )}

                          {["select", "radio", "checkbox"].includes(field.type) && (
                            <div className="space-y-1">
                              <p className="text-[10px] text-gray-500 uppercase font-medium">Options</p>
                              {(field.options ?? []).map((opt, optIdx) => (
                                <div key={optIdx} className="flex items-center gap-1">
                                  <input
                                    value={opt}
                                    onChange={(e) => updateOption(field.id, optIdx, e.target.value)}
                                    placeholder={`Option ${optIdx + 1}`}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs focus:border-red-500 outline-none"
                                  />
                                  <button
                                    onClick={() => removeOption(field.id, optIdx)}
                                    className="p-1 text-gray-400 hover:text-red-500"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addOption(field.id)}
                                className="text-xs text-red-600 hover:text-red-700 font-medium"
                              >
                                + Add Option
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => removeField(field.id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Files Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-800">File Attachments</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filesEnabled}
                    onChange={(e) => setFilesEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-red-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">Allow {activeRole} users to attach files to tickets</p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={upsertConfig.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {upsertConfig.isPending ? "Saving…" : <><Save className="w-4 h-4" /> Save Configuration</>}
            </button>
          </div>

          {/* Right: Preview */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-800 mb-4">Preview — {activeRole} Ticket Form</h3>
            <div className="space-y-4 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <p className="text-[10px] text-gray-400">
                The answer to the first field below is used as the ticket subject.
              </p>

              {/* Custom Fields */}
              {fields.map((field) => (
                <div key={field.id}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {field.label || "Untitled Field"}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {field.type === "text" && (
                    <input disabled placeholder={field.placeholder} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                  )}
                  {field.type === "textarea" && (
                    <textarea disabled placeholder={field.placeholder} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
                  )}
                  {field.type === "select" && (
                    <select disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                      <option>Select…</option>
                      {(field.options ?? []).map((opt, i) => (
                        <option key={i}>{opt || `Option ${i + 1}`}</option>
                      ))}
                    </select>
                  )}
                  {field.type === "radio" && (
                    <div className="flex flex-wrap gap-3">
                      {(field.options ?? []).map((opt, i) => (
                        <label key={i} className="flex items-center gap-1 text-sm text-gray-700">
                          <input type="radio" disabled className="text-red-600" />
                          {opt || `Option ${i + 1}`}
                        </label>
                      ))}
                    </div>
                  )}
                  {field.type === "checkbox" && (
                    <div className="flex flex-wrap gap-3">
                      {(field.options ?? []).map((opt, i) => (
                        <label key={i} className="flex items-center gap-1 text-sm text-gray-700">
                          <input type="checkbox" disabled className="text-red-600 rounded" />
                          {opt || `Option ${i + 1}`}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Fixed: Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea disabled placeholder="Describe your issue…" rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" />
              </div>

              {/* Files */}
              {filesEnabled && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Attachments</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-gray-400 text-xs">
                    Click or drag files here
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
