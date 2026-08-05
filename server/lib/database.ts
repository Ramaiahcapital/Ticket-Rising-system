import type {
  AuditLogRow,
  BranchRoleRow,
  BranchRow,
  ClusterRow,
  EmailTemplateRow,
  GoogleAuthRow,
  NotificationRow,
  Profile,
  StationaryItemRow,
  StationaryOrderItemRow,
  StationaryOrderRow,
  StationaryPortalSettingsRow,
  SystemSettingRow,
  TicketAttachmentRow,
  TicketCategoryRow,
  TicketCommentRow,
  TicketFormConfigRow,
  TicketPriorityRow,
  TicketRow,
  TicketStatusRow,
  TicketSubcategoryRow,
  TicketTimelineRow,
} from "./db-types.js";

type Table<R> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      ticket_statuses: Table<TicketStatusRow>;
      ticket_priorities: Table<TicketPriorityRow>;
      ticket_categories: Table<TicketCategoryRow>;
      ticket_subcategories: Table<TicketSubcategoryRow>;
      tickets: Table<TicketRow>;
      ticket_timeline: Table<TicketTimelineRow>;
      ticket_comments: Table<TicketCommentRow>;
      ticket_attachments: Table<TicketAttachmentRow>;
      notifications: Table<NotificationRow>;
      audit_logs: Table<AuditLogRow>;
      system_settings: Table<SystemSettingRow>;
      email_templates: Table<EmailTemplateRow>;
      clusters: Table<ClusterRow>;
      branches: Table<BranchRow>;
      stationary_items: Table<StationaryItemRow>;
      stationary_portal_settings: Table<StationaryPortalSettingsRow>;
      stationary_orders: Table<StationaryOrderRow>;
      stationary_order_items: Table<StationaryOrderItemRow>;
      ticket_form_config: Table<TicketFormConfigRow>;
      branch_roles: Table<BranchRoleRow>;
      google_auth: Table<GoogleAuthRow>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
