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

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type TaskPriority = 'HIGH' | 'NORMAL';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;    // ISO date string YYYY-MM-DD
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  status?: TaskStatus;
  due_date?: string | null;
  assigned_to?: string;
}

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

export interface TicketManufacturedItem {
  id: string;
  manufactured_item_id: string;
  manufactured_items: Pick<ManufacturedItem, 'id' | 'part_number' | 'serial_number'> | null;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  kit_id: string | null;
  manufactured_item_id: string | null;
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
  kits?: Pick<Kit, 'id' | 'serial_number' | 'status'> | null;
  kit_components?: Pick<KitComponent, 'id' | 'component_type'> | null;
  mainboard_sections?: Pick<MainboardSectionRecord, 'id' | 'section_name'> | null;
  ticket_comments?: TicketComment[];
  ticket_attachments?: TicketAttachment[];
  clients?: Pick<Client, 'id' | 'name'> | null;
  manufactured_items?: Pick<ManufacturedItem, 'id' | 'part_number' | 'serial_number'> | null;
  ticket_manufactured_items?: TicketManufacturedItem[];
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
  manufacture_code: string | null;
  client_id: string | null;
  target_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  production_steps?: ProductionStep[];
  lot_imports?: { item_count: number; lot_number: string; clients?: { name: string } | null }[];
  clients?: Pick<Client, 'id' | 'name'> | null;
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
  kit_id?: string;
  manufactured_item_id?: string;
  manufactured_item_ids?: string[];
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
  component_type?: ComponentType; // legacy field — new entries use reference only
  reference: string; // GBX part number from product_catalog
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
  manufacture_code?: string;
  client_id?: string;
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

export type ManufacturedItemStatus = 'OK' | 'IN_PROCESS' | 'IN_TRANSIT' | 'AT_CLIENT' | 'RETURNED' | 'BAD' | 'MANUAL' | 'EXTRA' | 'OWE';

export type ManufacturedItemLocation =
  | 'FACTORY'
  | 'TRANSIT'
  | 'GBX_WAREHOUSE_CHINA'
  | 'GBX_WAREHOUSE'
  | 'FREIGHT_FORWARDER'
  | 'CLIENT_WAREHOUSE'
  // legacy values
  | 'SUPPLIER'
  | 'GBX'
  | 'CLIENT';

export interface ManufacturedItem {
  id: string;
  part_number: string;
  serial_number: string;
  lot_number: string | null;
  box_label: string | null;
  production_order_id: string | null;
  client_id: string | null;
  status: ManufacturedItemStatus;
  location: ManufacturedItemLocation | null;
  issue: string | null;
  comment: string | null;
  image_url: string | null;
  stock_verified_at: string | null;
  stock_verified_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  clients?: { id: string; name: string } | null;
  tickets?: { count: number }[];
}

export interface CreateManufacturedItemInput {
  part_number: string;
  serial_number: string;
  lot_number?: string;
  box_label?: string | null;
  production_order_id?: string;
  client_id?: string;
  status?: ManufacturedItemStatus;
  location?: ManufacturedItemLocation;
  issue?: string | null;
  comment?: string | null;
  image_url?: string | null;
}

export interface IssueDefinition {
  id: string;
  name: string;
  keywords: string[];
  created_at: string;
}

export interface CreateIssueDefinitionInput {
  name: string;
  keywords: string[];
}

export interface ProductDimension {
  id: string;
  part_number: string;
  size_cm: string | null;
  volume_m3: number | null;
  weight_kg: number | null;
  boxes_qty: number | null;
  qty_per_box: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertProductDimensionInput {
  part_number: string;
  size_cm?: string | null;
  volume_m3?: number | null;
  weight_kg?: number | null;
  boxes_qty?: number | null;
  qty_per_box?: number | null;
}

export interface ProductCatalogItem {
  id: string;
  part_number: string;
  created_at: string;
}

export type LotStatus =
  | 'PRODUCTION' | 'QA' | 'PACKED' | 'TRANSIT' | 'GBX_WAREHOUSE' | 'FREIGHT_FORWARDER' | 'CLIENT_WAREHOUSE'
  // legacy values
  | 'DELIVERED' | 'IN_TRANSIT' | 'AT_WAREHOUSE' | 'AT_FACTORY' | 'DELAYED';

export interface LotImport {
  id: string;
  lot_number: string;
  docx_path: string | null;
  xlsx_path: string | null;
  item_count: number;
  client_id: string | null;
  production_order_id: string | null;
  lot_status: LotStatus;
  pl_approved: boolean;
  serial_approved: boolean;
  extra_units: Record<string, number> | null; // { "PART_NUMBER": extra_count }
  created_at: string;
  // Joined
  clients?: { id: string; name: string } | null;
  production_orders?: { id: string; order_number: string } | null;
}

export interface CreateLotImportInput {
  lot_number: string;
  docx_path?: string;
  xlsx_path?: string;
  item_count: number;
  client_id?: string;
  production_order_id?: string | null;
  lot_status?: LotStatus;
  pl_approved?: boolean;
  serial_approved?: boolean;
  extra_units?: Record<string, number> | null;
}

export type NoteColor = 'zinc' | 'yellow' | 'blue' | 'green' | 'red' | 'purple';

export interface Note {
  id: string;
  content: string;
  color: NoteColor;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

