import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useBranchRoles } from "@/hooks/useBranchRoles";
import { supabase } from "@/lib/supabase";
import RichTextEditor from "@/components/RichTextEditor";
import {
  ArrowLeft, Send, Clock, User, Tag,
  Building2, Calendar, Loader2, RefreshCw,
  Download, X, ChevronLeft, ChevronRight,
  FileText, ImageIcon, Bell, Forward, Search,
} from "lucide-react";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, isTransfer } = useAuth();
  const { getColor } = useBranchRoles();
  const ticketId = id ?? "";

  const chatRef = useRef<HTMLDivElement>(null);

  const [comment, setComment] = useState("");
  const [commentHtml, setCommentHtml] = useState("");
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentUploading, setCommentUploading] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversation" | "timeline">("conversation");
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxCommentId, setLightboxCommentId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferSearch, setTransferSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: ticket, isLoading } = trpc.ticket.byId.useQuery({ id: ticketId });
  const { data: comments } = trpc.ticketComment.list.useQuery({ ticketId });
  const { data: timeline } = trpc.ticketTimeline.list.useQuery({ ticketId });
  const { data: statuses } = trpc.ticketStatus.listEnabled.useQuery();
  const { data: formConfig } = trpc.ticket.getFormConfig.useQuery(
    { role: ticket?.branchRole ?? undefined },
    { enabled: !!ticket?.branchRole }
  );
  const recordAttachment = trpc.ticket.recordAttachment.useMutation();
  const { data: settings } = trpc.settings.list.useQuery();
  const liveChatEnabled = settings?.live_chat_enabled !== "false";

  const formConfigData = Array.isArray(formConfig) ? formConfig[0] : formConfig;
  const filesEnabled = formConfigData?.filesEnabled ?? true;

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
              if (blob.size <= maxBytes || quality <= 0.1) resolve(blob);
              else { quality -= 0.1; tryCompress(); }
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

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [comments, activeTab]);

  const addComment = trpc.ticketComment.create.useMutation({
    onSuccess: () => {
      utils.ticketComment.list.invalidate({ ticketId });
      utils.ticketTimeline.list.invalidate({ ticketId });
    },
  });

  const changeStatus = trpc.ticket.changeStatus.useMutation({
    onSuccess: async () => {
      setStatusDropdown(false);
      await Promise.all([
        utils.ticket.byId.invalidate({ id: ticketId }),
        utils.ticketTimeline.list.invalidate({ ticketId }),
      ]);
      setStatusChanging(false);
    },
    onError: () => {
      setStatusChanging(false);
    },
  });

  const notifyBranch = trpc.ticket.notifyBranch.useMutation({
    onSuccess: () => {
      alert("Branch user has been notified via email.");
    },
    onError: (err) => {
      alert(err.message || "Failed to send notification.");
    },
  });

  const transferTicket = trpc.ticket.transfer.useMutation({
    onSuccess: () => {
      alert("Ticket transferred successfully. The recipient will receive an email with the portal link. (If email failed, check your Email Settings to connect Google.)");
      setTransferOpen(false);
      setTransferEmail("");
      setTransferSearch("");
    },
    onError: (err) => {
      alert(err.message || "Failed to transfer ticket.");
    },
  });

  const { data: transferUsers } = trpc.transferUser.all.useQuery(undefined, { enabled: transferOpen });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Ticket not found</p>
        <button onClick={() => navigate("/tickets")} className="text-red-600 text-sm mt-2 hover:underline">
          Back to tickets
        </button>
      </div>
    );
  }

  const handleSendComment = async () => {
    const text = comment.trim();
    if ((!text && commentFiles.length === 0) || addComment.isPending || commentUploading) return;
    setCommentUploading(true);
    try {
      const result = await addComment.mutateAsync({
        ticketId,
        content: text || "(attachment)",
        contentHtml: commentHtml || undefined,
      });
      if (commentFiles.length > 0 && result?.id) {
        for (const file of commentFiles) {
          const compressed = await compressImage(file);
          const ext = file.name.split(".").pop() || "jpg";
          const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("ticket-attachments")
            .upload(fileName, compressed, { contentType: file.type, upsert: false });
          if (uploadError) throw uploadError;
          await recordAttachment.mutateAsync({
            ticketId,
            commentId: result.id,
            fileName: file.name,
            fileType: file.type,
            fileSize: compressed.size,
            filePath: fileName,
          });
        }
        utils.ticketComment.list.invalidate({ ticketId });
      }
      setComment("");
      setCommentHtml("");
      setCommentFiles([]);
      setReplyOpen(false);
    } finally {
      setCommentUploading(false);
    }
  };

  const handleStatusChange = (statusId: string) => {
    setStatusChanging(true);
    changeStatus.mutate({ ticketId, statusId });
  };

  const statusColor = ticket.status?.color || "#6B7280";

  const getAttachmentUrl = (filePath: string) => {
    return supabase.storage.from("ticket-attachments").getPublicUrl(filePath).data.publicUrl;
  };

  const renderAttachments = (attachments: any[]) => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {attachments.map((a: any) => {
          const url = getAttachmentUrl(a.filePath);
          const isImage = a.fileType?.startsWith("image/");
          return (
            <div key={a.id} className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 hover:shadow-sm transition-shadow group">
              {isImage ? (
                <button
                  onClick={() => {
                    setLightboxCommentId(null);
                    const allAtts = attachments;
                    const idx = allAtts.findIndex((x: any) => x.id === a.id);
                    setLightboxIndex(idx >= 0 ? idx : 0);
                    setLightboxCommentId("comment");
                  }}
                  className="block"
                >
                  <img src={url} alt={a.fileName} className="w-40 h-28 object-cover" loading="lazy" />
                </button>
              ) : (
                <a href={url} download={a.fileName} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 transition-colors">
                  <FileText className="w-8 h-8 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate max-w-[160px]">{a.fileName}</p>
                    <p className="text-[10px] text-gray-400">{(a.fileSize / 1024).toFixed(0)} KB</p>
                  </div>
                  <Download className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/tickets")}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-red-600 font-medium">{ticket.ticketNumber}</span>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-500 ease-in-out"
                  style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
                >
                  {ticket.status?.name || "Unknown"}
                </span>
                {ticket.createdAt && (
                  <span className="text-[11px] text-gray-400">created {new Date(ticket.createdAt).toLocaleDateString()} {new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                )}
                {(ticket as any).statusChangedAt && (
                  <span className="text-[11px] text-gray-400">updated {new Date((ticket as any).statusChangedAt).toLocaleDateString()} {new Date((ticket as any).statusChangedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                )}
                {ticket.branchRole && (
                  <span
                    className="px-2 py-0.5 rounded text-xs font-medium"
                    style={{ backgroundColor: `${getColor(ticket.branchRole)}1A`, color: getColor(ticket.branchRole) }}
                  >{ticket.branchRole}</span>
                )}
              </div>
              <h1 className="text-lg font-semibold text-gray-800 mt-1">{ticket.subject}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setReplyOpen((o) => !o)}
              disabled={!liveChatEnabled}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                replyOpen
                  ? "bg-gray-100 text-gray-700 border border-gray-300"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <Send className="w-4 h-4" />
              {replyOpen ? "Close Reply" : "Reply"}
            </button>

            {(isAdmin || isTransfer) && (
              <button
                onClick={() => {
                  if (confirm("Send an email notification to the branch user about your latest reply?")) {
                    notifyBranch.mutate({ ticketId });
                  }
                }}
                disabled={notifyBranch.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {notifyBranch.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                Notify Branch
              </button>
            )}

            {isAdmin && (
            <button
              onClick={() => setTransferOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Forward className="w-4 h-4" />
              Transfer
            </button>
            )}

            {(isAdmin || isTransfer) && (
              <div className="relative">
              <button
                onClick={() => setStatusDropdown(!statusDropdown)}
                disabled={statusChanging}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {statusChanging ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {statusChanging ? "Updating Status..." : "Change Status"}
              </button>
              {statusDropdown && !statusChanging && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStatusDropdown(false)} />
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 z-50 py-1">
                    {statuses?.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleStatusChange(s.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-gray-700">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab("conversation")}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === "conversation" ? "text-red-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Conversation
                {activeTab === "conversation" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />}
              </button>
              <button
                onClick={() => setActiveTab("timeline")}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === "timeline" ? "text-red-600" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Timeline History
                {activeTab === "timeline" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />}
              </button>
            </div>

            <div className="p-4">
              {activeTab === "conversation" ? (
                <div className="flex flex-col h-[60vh] min-h-[420px]">
                  {/* Full chat thread (original message + all replies) scrolls as one */}
                  <div ref={chatRef} className="chat-scroll flex-1 min-h-0 overflow-y-auto space-y-3 pr-2 mb-3">
                    {/* Original message (ticket description) */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {(ticket as any).createdByProfile?.name || ticket.branch?.contactPerson || "Branch User"}
                            {(ticket as any).createdByProfile?.role === "cluster" && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Cluster</span>
                            )}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {ticket.branch?.branchName || (ticket as any).createdByProfile?.branchName || (ticket as any).createdByProfile?.name || ""} · {new Date(ticket.createdAt ?? new Date()).toLocaleDateString()} {new Date(ticket.createdAt ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      {ticket.description && (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
                      )}
                      {(ticket as any).attachments?.length > 0 && renderAttachments((ticket as any).attachments)}
                    </div>
                  </div>

                    {/* Comments as email thread */}
                    <div className="space-y-0">
                      {comments?.length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        No replies yet. Press the "Reply" button to respond.
                      </div>
                    )}
                    {comments?.map((c) => {
                      const isAdminAuthor = c.authorType === "admin";
                      const isTransferAuthor = c.authorType === "transfer";
                      return (
                        <div key={c.id} className="border border-gray-200 rounded-lg overflow-hidden mb-3">
                          {/* Email header */}
                          <div className={`px-4 py-2.5 border-b border-gray-200 ${c.isInternal ? "bg-yellow-50" : "bg-gray-50"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  isAdminAuthor ? "bg-red-100 text-red-600" : isTransferAuthor ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                                }`}>
                                  <User className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-gray-800">{c.authorName}</p>
                                    {isAdminAuthor && (
                                      <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded font-medium">Admin</span>
                                    )}
                                    {isTransferAuthor && (
                                      <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 text-[10px] rounded font-medium">Transfer User</span>
                                    )}
                                    {c.isInternal && (
                                      <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] rounded font-medium">Internal Note</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <p className="text-[10px] text-gray-400">
                                {new Date(c.createdAt ?? new Date()).toLocaleDateString()} {new Date(c.createdAt ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                          {/* Email body */}
                          <div className="px-4 py-3">
                            {(c as any).contentHtml ? (
                              <div
                                className="rich-text text-sm text-gray-700 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: (c as any).contentHtml }}
                              />
                            ) : (
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{c.content}</p>
                            )}
                            {c.attachments && c.attachments.length > 0 && renderAttachments(c.attachments)}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {/* Input — only appears after pressing the Reply button */}
                  {replyOpen && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                        <p className="text-xs text-gray-500 font-medium">Reply</p>
                        <button onClick={() => setReplyOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="p-3">
                        <RichTextEditor
                          value={commentHtml}
                          onChange={(html, text) => {
                            setCommentHtml(html);
                            setComment(text);
                          }}
                          placeholder="Type your reply..."
                          onCtrlEnter={handleSendComment}
                        />

                        {/* File attachment preview */}
                        {commentFiles.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {commentFiles.map((file, i) => (
                              <div key={i} className="relative group bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-16 object-cover" />
                                <div className="p-1">
                                  <p className="text-[9px] text-gray-500 truncate">{file.name}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setCommentFiles(commentFiles.filter((_, idx) => idx !== i))}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                                >×</button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-gray-400">Ctrl+Enter to send</p>
                            {filesEnabled && (
                              <>
                                <input
                                  type="file"
                                  multiple
                                  accept="image/*"
                                  onChange={(e) => {
                                    const selected = Array.from(e.target.files ?? []);
                                    const valid = selected.filter(f => {
                                      if (!f.type.startsWith("image/")) return false;
                                      if (f.size > 2 * 1024 * 1024) return false;
                                      return true;
                                    });
                                    setCommentFiles(prev => {
                                      const combined = [...prev, ...valid];
                                      if (combined.length > 5) alert("Maximum 5 images per comment");
                                      return combined.slice(0, 5);
                                    });
                                  }}
                                  className="hidden"
                                  id="comment-files"
                                />
                                <label
                                  htmlFor="comment-files"
                                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer transition-colors"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  Attach
                                </label>
                              </>
                            )}
                          </div>
                          <button
                            onClick={handleSendComment}
                            disabled={(!comment.trim() && commentFiles.length === 0) || addComment.isPending || commentUploading}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-30"
                          >
                            {(addComment.isPending || commentUploading) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                            Send Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="chat-scroll space-y-0 h-[60vh] min-h-[420px] overflow-y-auto pr-2">
                  {timeline?.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No timeline events yet.
                    </div>
                  )}
                  {timeline?.map((entry, idx) => (
                    <div key={entry.id} className="flex gap-3 py-3 border-b border-gray-50 last:border-0">
                      <div className="relative flex flex-col items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        {idx < (timeline?.length || 0) - 1 && (
                          <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{entry.action.replace(/_/g, " ")}</span>
                          <span className="text-xs text-gray-400">
                             {new Date(entry.createdAt ?? new Date()).toLocaleDateString()}
                          </span>
                        </div>
                        {entry.description && (
                          <p className="text-sm text-gray-600 mt-0.5">{entry.description}</p>
                        )}
                        {entry.previousValue && entry.newValue && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {entry.previousValue} &rarr; {entry.newValue}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">by {entry.actorName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-800">Ticket Details</h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Status:</span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium ml-auto"
                  style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
                >
                  {ticket.status?.name || "-"}
                </span>
              </div>

              {(ticket as any).statusChangedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Status Updated:</span>
                  <span className="ml-auto">{new Date((ticket as any).statusChangedAt).toLocaleDateString()} {new Date((ticket as any).statusChangedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Branch:</span>
                <span className="ml-auto">{ticket.branch?.branchName || (ticket as any).createdByProfile?.branchName || (ticket as any).createdByProfile?.name || "-"}</span>
              </div>
              {ticket.branchRole && (
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Role:</span>
                  <span className="ml-auto">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${getColor(ticket.branchRole)}1A`, color: getColor(ticket.branchRole) }}
                    >{ticket.branchRole}</span>
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Created by:</span>
                <span className="ml-auto">
                  {(ticket as any).createdByProfile?.name || ticket.branch?.contactPerson || "-"}
                  {(ticket as any).createdByProfile?.role === "cluster" && (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Cluster</span>
                  )}
                </span>
              </div>

              {ticket.assignee && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Assigned to:</span>
                  <span className="ml-auto">{ticket.assignee.name || "-"}</span>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-auto">{new Date(ticket.createdAt ?? new Date()).toLocaleDateString()} {new Date(ticket.createdAt ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">Updated:</span>
                  <span className="ml-auto">{new Date(ticket.updatedAt ?? new Date()).toLocaleDateString()} {new Date(ticket.updatedAt ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {(ticket as any).statusChangedAt && (
                  <div className="flex items-center gap-2 mt-1">
                    <RefreshCw className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">Status Updated:</span>
                    <span className="ml-auto">{new Date((ticket as any).statusChangedAt).toLocaleDateString()} {new Date((ticket as any).statusChangedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom Fields */}
          {(() => {
            const cfg = Array.isArray(formConfig) ? formConfig[0] : formConfig;
            const fields: any[] = cfg?.fields ?? [];
            const custom = (ticket as any)?.customFields ?? {};
            if (fields.length === 0) return null;
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h3 className="font-semibold text-gray-800 mb-1">Additional Details</h3>
                {fields.map((f) => {
                  const v = custom[f.id];
                  if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
                  const display = Array.isArray(v) ? v.join(", ") : String(v);
                  return (
                    <div key={f.id} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                      <span className="text-xs font-medium text-gray-500 sm:w-40 sm:flex-shrink-0">{f.label}</span>
                      <span className="text-sm text-gray-800">{display}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-2">Description</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Transfer Modal */}
          {transferOpen && (() => {
            const filteredUsers = (transferUsers ?? []).filter(
              (u: { name: string | null; email: string | null }) =>
                (u.name || "").toLowerCase().includes(transferSearch.toLowerCase()) ||
                (u.email || "").toLowerCase().includes(transferSearch.toLowerCase())
            );
            return (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Transfer Ticket</h3>
                    <button onClick={() => { setTransferOpen(false); setTransferEmail(""); setTransferSearch(""); }} className="p-1 hover:bg-gray-100 rounded-lg">
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Select a user from the directory or type a custom email address.
                  </p>

                  {/* Search / manual email input */}
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Search or type email *</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={transferSearch}
                        onChange={(e) => {
                          setTransferSearch(e.target.value);
                          if (e.target.value.includes("@")) setTransferEmail(e.target.value);
                        }}
                        placeholder="Search by name, email, or department..."
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-purple-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Directory list */}
                  {transferUsers && transferUsers.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg mb-3 divide-y divide-gray-100">
                      {filteredUsers.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400">
                          {transferSearch ? "No users match" : "No transfer users configured"}
                        </div>
                      ) : (
                        filteredUsers.map((u: { id: string; name: string | null; email: string | null }) => (
                          <button
                            key={u.id}
                            onClick={() => { setTransferEmail(u.email || ""); setTransferSearch(u.name || ""); }}
                            className={`w-full text-left px-3 py-2.5 hover:bg-purple-50 transition-colors ${
                              transferEmail === u.email ? "bg-purple-50 border-l-2 border-purple-600" : ""
                            }`}
                          >
                            <div className="text-sm font-medium text-gray-800">{u.name}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Selected email display */}
                  {transferEmail && (
                    <div className="mb-4 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-purple-800 font-medium">{transferEmail}</span>
                      <button onClick={() => { setTransferEmail(""); setTransferSearch(""); }} className="text-purple-400 hover:text-purple-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setTransferOpen(false); setTransferEmail(""); setTransferSearch(""); }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!transferEmail.trim()) return;
                        if (!confirm(`Transfer this ticket to ${transferEmail}?`)) return;
                        transferTicket.mutate({ ticketId, toEmail: transferEmail.trim() });
                      }}
                      disabled={!transferEmail.trim() || transferTicket.isPending}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                      {transferTicket.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Forward className="w-4 h-4" />}
                      {transferTicket.isPending ? "Transferring..." : "Transfer Ticket"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Lightbox */}
          {lightboxIndex !== null && lightboxCommentId && (() => {
            const atts = lightboxCommentId === "comment"
              ? ((ticket as any).attachments ?? [])
              : (comments?.find(c => c.id === lightboxCommentId)?.attachments ?? []);
            const current = atts[lightboxIndex];
            if (!current) return null;
            const publicUrl = getAttachmentUrl(current.filePath);
            const prevIdx = lightboxIndex > 0 ? lightboxIndex - 1 : atts.length - 1;
            const nextIdx = lightboxIndex < atts.length - 1 ? lightboxIndex + 1 : 0;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => { setLightboxIndex(null); setLightboxCommentId(null); }}>
                <button onClick={() => { setLightboxIndex(null); setLightboxCommentId(null); }} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white z-10"><X className="w-6 h-6" /></button>
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(prevIdx); }} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white z-10"><ChevronLeft className="w-8 h-8" /></button>
                <button onClick={(e) => { e.stopPropagation(); setLightboxIndex(nextIdx); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/70 hover:text-white z-10"><ChevronRight className="w-8 h-8" /></button>
                <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                  <img src={publicUrl} alt={current.fileName} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
                </div>
                <div className="absolute bottom-4 text-white/60 text-xs">{current.fileName} ({(current.fileSize / 1024).toFixed(0)}KB)</div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
