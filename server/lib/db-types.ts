export type Role = "admin" | "branch" | "cluster";

/** Dynamic branch role name (managed via the branch_roles table). */
export type BranchRole = string;

export type BranchRoleRow = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type GoogleAuthRow = {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string;
  googleEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type Profile = {
  id: string;
  email: string | null;
  username: string | null;
  name: string | null;
  avatar: string | null;
  role: Role;
  branchName: string | null;
  branchCode: string | null;
  clusterId: string | null;
  branchRole: BranchRole | null;
  branchId: string | null;
  contactPerson: string | null;
  mobile: string | null;
  address: string | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
  createdBy: string | null;
};

export type BranchRow = {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
};

export type TicketStatusRow = {
  id: string;
  name: string;
  color: string;
  isOpen: boolean;
  isDefault: boolean;
  isEnabled: boolean;
  sortOrder: number;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TicketPriorityRow = {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string | null;
};

export type TicketCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TicketSubcategoryRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string | null;
};

export type TicketRow = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  categoryId: string | null;
  subcategoryId: string | null;
  priorityId: string | null;
  statusId: string | null;
  department: string | null;
  branchRole: BranchRole | null;
  branchId: string;
  createdBy: string;
  assignedTo: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  statusChangedAt: string | null;
  solvedAt: string | null;
  closedAt: string | null;
  customFields: Record<string, unknown> | null;
};

export type TicketTimelineRow = {
  id: string;
  ticketId: string;
  action: string;
  actorId: string;
  actorType: Role;
  actorName: string;
  previousValue: string | null;
  newValue: string | null;
  description: string | null;
  metadata: string | null;
  createdAt: string | null;
};

export type TicketCommentRow = {
  id: string;
  ticketId: string;
  content: string;
  contentHtml: string | null;
  authorId: string;
  authorType: Role;
  authorName: string;
  isInternal: boolean;
  parentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TicketAttachmentRow = {
  id: string;
  ticketId: string;
  commentId: string | null;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  uploadedBy: string;
  uploadedByType: "admin" | "branch";
  createdAt: string | null;
};

export type NotificationRow = {
  id: string;
  recipientId: string;
  recipientType: Role;
  title: string;
  message: string;
  type: string;
  ticketId: string | null;
  isRead: boolean;
  createdAt: string | null;
};

export type AuditLogRow = {
  id: string;
  userId: string | null;
  userType: "admin" | "branch" | "system";
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | null;
};

export type SystemSettingRow = {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type EmailTemplateRow = {
  id: string;
  name: string;
  subject: string;
  body: string;
  isEnabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** A single stationary / consumable item that branches can order. */
export type StationaryItemRow = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  price: number | null;
  /** Max quantity a SINGLE branch may order per active order window. */
  threshold: number | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

/** A cluster grouping of branches. */
export type ClusterRow = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string | null;
};

/** Single global config row for the stationary ordering portal. */
export type StationaryPortalSettingsRow = {
  id: string;
  /** Whether the portal is enabled for branches. */
  enabled: boolean;
  /** Portal opens at this timestamp (branches can order from here). */
  windowOpenAt: string | null;
  /** Portal closes at this timestamp (branches can order until here). */
  windowCloseAt: string | null;
  /** Branch roles allowed to access the portal (json array of BranchRole). */
  allowedRoles: string[] | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

/** A branch's stationary order (header). */
export type StationaryOrderRow = {
  id: string;
  branchId: string;
  createdBy: string;
  status: "pending" | "fulfilled" | "cancelled";
  clusterId: string | null;
  clusterApprovedAt: string | null;
  clusterApprovedBy: string | null;
  orderDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** A line item within a stationary order. */
export type StationaryOrderItemRow = {
  id: string;
  orderId: string;
  itemId: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  createdAt: string | null;
};

/** Unified user shape shared with the frontend. */
export type UnifiedUser =
  | {
      type: "admin";
      id: string;
      name: string | null;
      email: string | null;
      role: "admin";
      avatar?: string | null;
    }
  | {
      type: "branch";
      id: string;
      name: string;
      branchName: string;
      branchCode: string;
      role: "branch";
      branchRole: BranchRole | null;
      branchId: string | null;
      clusterId: string | null;
      email: string;
      username: string;
    }
  | {
      type: "cluster";
      id: string;
      name: string | null;
      email: string | null;
      role: "cluster";
      clusterId: string | null;
      clusterName: string | null;
    };

export function mapProfileToUnifiedUser(p: Profile): UnifiedUser {
  if (p.role === "admin") {
    return {
      type: "admin",
      id: p.id,
      name: p.name,
      email: p.email,
      role: "admin",
      avatar: p.avatar,
    };
  }
  if (p.role === "cluster") {
    return {
      type: "cluster",
      id: p.id,
      name: p.name,
      email: p.email,
      role: "cluster",
      clusterId: p.clusterId,
      clusterName: p.name,
    };
  }
  return {
    type: "branch",
    id: p.id,
    name: p.contactPerson || p.branchName || "",
    branchName: p.branchName || "",
    branchCode: p.branchCode || "",
    role: "branch",
    branchRole: p.branchRole,
    branchId: p.branchId,
    clusterId: p.clusterId,
    email: p.email || "",
    username: p.email || p.branchCode || "",
  };
}

/** A custom field definition in the ticket form config. */
export type TicketFormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox";
  required: boolean;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
};

/** Ticket form configuration per role. */
export type TicketFormConfigRow = {
  id: string;
  role: string;
  fields: TicketFormField[];
  filesEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
