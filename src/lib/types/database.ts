// ─────────────────────────────────────────────────────────────
// Enum string unions (mirrors database enums)
// ─────────────────────────────────────────────────────────────

export type KitType = 'NEW' | 'RETURN';

export type ProductUnitStatus = 'IN_STOCK' | 'IN_KIT' | 'FAULTY' | 'RETIRED';

export type AssembledKitStatus = 'ASSEMBLING' | 'READY' | 'DEPLOYED' | 'RETURNED' | 'RETIRED';

export type KitStatus = 'OK' | 'TICKET' | 'DEAD';

export type ComponentType =
  | 'ENCLOSURE'
  | 'MAIN_BOARD'
  | 'CAMERA_A_140'
  | 'CAMERA_B_140'
  | 'CAMERA_C_70'
  | 'CAMERA_FRAME'
  | 'POWER_SUPPLY'
  | 'WIFI_ANTENNA'
  | 'CELL_ANTENNA'
  | 'DOOR_LOCK_CABLE';

export type ComponentStatus = 'OK' | 'FAULTY' | 'REPLACED' | 'DEAD';

export type MainboardSection =
  | 'CM4'
  | 'POWER_MAIN'
  | 'POWER_2'
  | 'USB3_1'
  | 'USB3_2'
  | 'USB3_3'
  | 'USB2_1'
  | 'USB2_2'
  | 'USB2_3'
  | 'CELL_MODULE'
  | 'WIFI_BT'
  | 'IO_LOCK'
  | 'HDMI'
  | 'TOP_CONNECTORS'
  | 'RS232'
  | 'RS485';

export type IssueCategory =
  | 'USB'
  | 'POWER'
  | 'CAMERA'
  | 'WIFI'
  | 'CELLULAR'
  | 'DOOR_LOCK'
  | 'CM4_PROCESSOR'
  | 'ENCLOSURE'
  | 'FIRMWARE'
  | 'WRONG_CONNECTOR'
  | 'OTHER';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ProductionStatus = 'QUEUED' | 'ACTIVE' | 'COMPLETE' | 'CANCELLED';

export type ProductionItemType = 'KIT' | 'COMPONENT';

export interface ProductionOrderItem {
  type: ProductionItemType;
  reference?: string; // kit number when type='KIT'
  component_type?: ComponentType; // when type='COMPONENT'
  quantity: number;
}

export type ProductionStepStatus = 'PENDING' | 'ACTIVE' | 'DONE' | 'SKIPPED';

// ─────────────────────────────────────────────────────────────
// Database record interfaces
// ─────────────────────────────────────────────────────────────

export interface Kit {
  id: string;
  serial_number: string;
  type: KitType;
  status: KitStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  kit_components?: KitComponent[];
  tickets?: { count: number }[] | Ticket[];
}

export interface KitComponent {
  id: string;
  kit_id: string;
  component_type: ComponentType;
  status: ComponentStatus;
  fault_category: IssueCategory | null;
  serial_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  mainboard_sections?: MainboardSectionRecord[];
}

export interface MainboardSectionRecord {
  id: string;
  component_id: string;
  section_name: MainboardSection;
  status: ComponentStatus;
  issue_category: IssueCategory | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  kit_id: string;
  client_id: string | null;
  component_id: string | null;
  mainboard_section_id: string | null;
  title: string;
  description: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  issue_category: IssueCategory;
  assigned_to: string | null;
  created_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  kits?: Pick<Kit, 'id' | 'serial_number' | 'status'>;
  kit_components?: Pick<KitComponent, 'id' | 'component_type'> | null;
  mainboard_sections?: Pick<MainboardSectionRecord, 'id' | 'section_name'> | null;
  ticket_comments?: TicketComment[];
  ticket_attachments?: TicketAttachment[];
  clients?: Pick<Client, 'id' | 'name'> | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  // Joined fields
  ticket_attachments?: TicketAttachment[];
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  comment_id: string | null;
  file_url: string;
  file_name: string;
  file_type: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProductionOrder {
  id: string;
  order_number: string;
  quantity: number; // sum of all item quantities
  status: ProductionStatus;
  current_step: number;
  items: ProductionOrderItem[] | null;
  target_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  production_steps?: ProductionStep[];
}

export interface ProductionStep {
  id: string;
  order_id: string;
  step_number: number;
  step_name: string;
  description: string | null;
  status: ProductionStepStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: string;
  component_type: ComponentType;
  part_number: string | null;
  serial_number: string;
  lot_number: number | null;
  status: ProductUnitStatus;
  kit_id: string | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  assembled_kits?: Pick<AssembledKit, 'id' | 'kit_number'> | null;
}

export interface AssembledKit {
  id: string;
  kit_number: string;
  client_id: string | null;
  status: AssembledKitStatus;
  notes: string | null;
  assembled_by: string | null;
  assembled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  clients?: Pick<Client, 'id' | 'name'> | null;
  product_units?: ProductUnit[];
}

export interface KnownIssue {
  id: string;
  title: string;
  description: string;
  solution: string;
  board_section: MainboardSection | null;
  issue_category: IssueCategory;
  component_type: ComponentType | null;
  frequency: 'LOW' | 'MEDIUM' | 'HIGH';
  is_active: boolean;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────
// Utility types for forms
// ─────────────────────────────────────────────────────────────

export interface CreateKitInput {
  serial_number: string;
  type: KitType;
  notes?: string;
}

export interface CreateTicketInput {
  kit_id: string;
  client_id?: string;
  component_id?: string;
  mainboard_section_id?: string;
  title: string;
  description?: string;
  priority: TicketPriority;
  issue_category: IssueCategory;
}

export interface CreateClientInput {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface KitDefinitionComponent {
  component_type: ComponentType;
  reference?: string; // e.g. 'GBXIVO-IMB-PS1' for Power Supply variants
  quantity: number;
}

export interface KitDefinition {
  id: string;
  name: string;
  description: string | null;
  components: KitDefinitionComponent[];
  created_at: string;
  updated_at: string;
}

export interface CreateKitDefinitionInput {
  name: string;
  description?: string;
  components: KitDefinitionComponent[];
}

export interface CreateOrderInput {
  order_number: string;
  quantity: number; // derived: sum of item quantities
  items: ProductionOrderItem[];
  target_date?: string;
  notes?: string;
}

export interface KitFilters {
  type?: KitType | 'ALL';
  status?: KitStatus | 'ALL';
  search?: string;
}

export interface TicketFilters {
  status?: TicketStatus | 'ALL';
  priority?: TicketPriority | 'ALL';
  issue_category?: IssueCategory | 'ALL';
  search?: string;
}

export interface ProductionFilters {
  status?: ProductionStatus | 'ALL';
}

export interface CreateProductUnitInput {
  component_type: ComponentType;
  part_number?: string;
  serial_number: string;
  lot_number?: number;
  notes?: string;
}

export interface CreateAssembledKitInput {
  kit_number: string;
  client_id?: string;
  notes?: string;
  unit_ids: string[]; // product_unit IDs to assign
}

export interface ProductUnitFilters {
  component_type?: ComponentType | 'ALL';
  status?: ProductUnitStatus | 'ALL';
  search?: string;
}

export interface AssembledKitFilters {
  status?: AssembledKitStatus | 'ALL';
  search?: string;
}
