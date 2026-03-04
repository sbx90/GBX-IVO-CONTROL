import type {
  ComponentType,
  ComponentStatus,
  KitStatus,
  KitType,
  IssueCategory,
  TicketStatus,
  TicketPriority,
  TaskStatus,
  TaskPriority,
  ProductionStatus,
  ProductionStepStatus,
  MainboardSection,
  ProductUnitStatus,
  AssembledKitStatus,
} from './types/database';

// ─────────────────────────────────────────────────────────────
// Component config — 9 hardware component types
// ─────────────────────────────────────────────────────────────

export const COMPONENT_CONFIG: Record<
  ComponentType,
  { label: string; partNumber: string; icon: string; description: string }
> = {
  ENCLOSURE: {
    label: 'Enclosure',
    partNumber: 'GBXIVO-IMB_ENC',
    icon: 'Box',
    description: 'Outer housing and mounting',
  },
  MAIN_BOARD: {
    label: 'Main Board',
    partNumber: 'GBXIVO-IMB_MB',
    icon: 'Circuit',
    description: 'Carrier board + CM4',
  },
  CAMERA_A_140: {
    label: 'Camera A (140°)',
    partNumber: 'GBXIVO-IMB_CAM-A',
    icon: 'Camera',
    description: 'Wide-angle, green cable, USB2_3',
  },
  CAMERA_B_140: {
    label: 'Camera B (140°)',
    partNumber: 'GBXIVO-IMB_CAM-B',
    icon: 'Camera',
    description: 'Wide-angle, purple cable, USB3_2',
  },
  CAMERA_C_70: {
    label: 'Camera C (70°)',
    partNumber: 'GBXIVO-IMB_CAM-C',
    icon: 'Camera',
    description: 'Standard FOV, yellow cable, USB3_1',
  },
  CAMERA_FRAME: {
    label: 'Camera Frame',
    partNumber: 'GBXIVO-IMB_CFR',
    icon: 'Camera',
    description: 'Camera mounting frame',
  },
  POWER_SUPPLY: {
    label: 'Power Supply',
    partNumber: 'GBXIVO-IMB-PS',
    icon: 'Zap',
    description: 'PSU — connect to POWER_MAIN (left)',
  },
  WIFI_ANTENNA: {
    label: 'WiFi + Cell Antenna',
    partNumber: 'GBXIVO-IMB_RCW',
    icon: 'Wifi',
    description: 'WiFi/BT + cellular antenna module (ships as one unit)',
  },
  CELL_ANTENNA: {
    label: 'Cell Antenna',
    partNumber: 'GBXIVO-IMB_CELL',
    icon: 'Signal',
    description: 'Cellular modem antenna (auto-paired with WiFi Antenna)',
  },
  DOOR_LOCK_CABLE: {
    label: 'Door Lock Cable',
    partNumber: 'GBXIVO-IMB_CDL',
    icon: 'Lock',
    description: 'Door lock trigger cable',
  },
};

// ─────────────────────────────────────────────────────────────
// Component order — 3×3 grid layout
// ─────────────────────────────────────────────────────────────

export const COMPONENT_ORDER: ComponentType[] = [
  'ENCLOSURE',
  'MAIN_BOARD',
  'CAMERA_A_140',
  'CAMERA_B_140',
  'CAMERA_C_70',
  'CAMERA_FRAME',
  'POWER_SUPPLY',
  'WIFI_ANTENNA',
  'CELL_ANTENNA',
  'DOOR_LOCK_CABLE',
];

// Enclosure ships with Main Board as a single unit.
// In product_units, ENCLOSURE is auto-created alongside MAIN_BOARD using this suffix.
// It is hidden from all Stock/Kit UIs — treat MAIN_BOARD as representing both.
export const ENCLOSURE_SERIAL_SUFFIX = '-ENCL';

// Cell Antenna ships with WiFi Antenna as a single unit.
// In product_units, CELL_ANTENNA is auto-created alongside WIFI_ANTENNA using this suffix.
// It is hidden from all Stock/Kit UIs — treat WIFI_ANTENNA as representing both.
export const CELL_ANTENNA_SERIAL_SUFFIX = '-CELL';

// Component order visible in Stock/Kit UIs
// (ENCLOSURE is implicit with MAIN_BOARD, CELL_ANTENNA is implicit with WIFI_ANTENNA)
export const STOCK_COMPONENT_ORDER: ComponentType[] = COMPONENT_ORDER.filter(
  (t) => t !== 'ENCLOSURE' && t !== 'CELL_ANTENNA'
);

// ─────────────────────────────────────────────────────────────
// Status configs — colors and labels
// ─────────────────────────────────────────────────────────────

export const KIT_STATUS_CONFIG: Record<
  KitStatus,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  OK: {
    label: 'OK',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
    dotColor: 'bg-green-400',
  },
  TICKET: {
    label: 'Ticket',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
    dotColor: 'bg-amber-400',
  },
  DEAD: {
    label: 'Dead',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10 border border-red-400/20',
    dotColor: 'bg-red-400',
  },
};

export const KIT_TYPE_CONFIG: Record<
  KitType,
  { label: string; color: string; bgColor: string }
> = {
  NEW: {
    label: 'New',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
  },
  RETURN: {
    label: 'Return',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
  },
};

export const COMPONENT_STATUS_CONFIG: Record<
  ComponentStatus,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  OK: {
    label: 'OK',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
    dotColor: 'bg-green-400',
  },
  FAULTY: {
    label: 'Faulty',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
    dotColor: 'bg-amber-400',
  },
  REPLACED: {
    label: 'Replaced',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
    dotColor: 'bg-blue-400',
  },
  DEAD: {
    label: 'Dead',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10 border border-red-400/20',
    dotColor: 'bg-red-400',
  },
};

export const TICKET_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; bgColor: string }
> = {
  OPEN: {
    label: 'Open',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
  },
  RESOLVED: {
    label: 'Resolved',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10 border border-zinc-400/20',
  },
};

export const PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; color: string; bgColor: string }
> = {
  LOW: {
    label: 'Low',
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10 border border-slate-400/20',
  },
  MEDIUM: {
    label: 'Medium',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
  },
  HIGH: {
    label: 'High',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
  },
  CRITICAL: {
    label: 'Critical',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10 border border-red-400/20',
  },
};

export const PRODUCTION_STATUS_CONFIG: Record<
  ProductionStatus,
  { label: string; color: string; bgColor: string }
> = {
  QUEUED: {
    label: 'Queued',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10 border border-zinc-400/20',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
  },
  COMPLETE: {
    label: 'Complete',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: 'text-red-400',
    bgColor: 'bg-red-400/10 border border-red-400/20',
  },
};

export const PRODUCTION_STEP_STATUS_CONFIG: Record<
  ProductionStepStatus,
  { label: string; color: string; bgColor: string; circleClass: string }
> = {
  PENDING: {
    label: 'Pending',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10',
    circleClass: 'bg-zinc-700 text-zinc-400 border border-zinc-600',
  },
  ACTIVE: {
    label: 'Active',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    circleClass: 'bg-blue-500 text-white border border-blue-400',
  },
  DONE: {
    label: 'Done',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    circleClass: 'bg-green-500 text-white border border-green-400',
  },
  SKIPPED: {
    label: 'Skipped',
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-500/10',
    circleClass: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
  },
};

// ─────────────────────────────────────────────────────────────
// Issue category config
// ─────────────────────────────────────────────────────────────

export const ISSUE_CATEGORY_CONFIG: Record<IssueCategory, { label: string }> = {
  USB: { label: 'USB' },
  POWER: { label: 'Power' },
  CAMERA: { label: 'Camera' },
  WIFI: { label: 'WiFi' },
  CELLULAR: { label: 'Cellular' },
  DOOR_LOCK: { label: 'Door Lock' },
  CM4_PROCESSOR: { label: 'CM4 Processor' },
  ENCLOSURE: { label: 'Enclosure' },
  FIRMWARE: { label: 'Firmware' },
  WRONG_CONNECTOR: { label: 'Wrong Connector' },
  OTHER: { label: 'Other' },
};

// ─────────────────────────────────────────────────────────────
// Task status & priority config
// ─────────────────────────────────────────────────────────────

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  TODO: { label: 'Todo', color: 'text-zinc-400', bgColor: 'bg-zinc-400/10 border border-zinc-400/20' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-blue-400', bgColor: 'bg-blue-400/10 border border-blue-400/20' },
  DONE: { label: 'Done', color: 'text-green-400', bgColor: 'bg-green-400/10 border border-green-400/20' },
};

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; dotColor: string }> = {
  HIGH: { label: 'High', color: 'text-red-400', dotColor: 'bg-red-400' },
  NORMAL: { label: 'Normal', color: 'text-zinc-500', dotColor: 'bg-zinc-500' },
};

// ─────────────────────────────────────────────────────────────
// Mainboard section config — 13 sections
// ─────────────────────────────────────────────────────────────

export const MAINBOARD_SECTION_CONFIG: Record<
  MainboardSection,
  {
    label: string;
    shortLabel: string;
    category: string;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
    isDanger?: boolean;
    isCorrectPower?: boolean;
    cameraMapping?: string;
  }
> = {
  TOP_CONNECTORS: {
    label: 'Top Connectors',
    shortLabel: 'TOP',
    category: 'IO',
    color: 'text-zinc-300',
    bgColor: 'bg-zinc-700/40',
    borderColor: 'border-zinc-600/50',
    description: 'Top-row I/O connectors (misc external ports)',
  },
  CM4: {
    label: 'CM4 Module',
    shortLabel: 'CM4',
    category: 'Compute',
    color: 'text-violet-300',
    bgColor: 'bg-violet-500/15',
    borderColor: 'border-violet-500/30',
    description: 'Raspberry Pi Compute Module 4 — main processor',
  },
  CELL_MODULE: {
    label: 'Cellular Module',
    shortLabel: 'CELL',
    category: 'Connectivity',
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-500/15',
    borderColor: 'border-cyan-500/30',
    description: '4G/LTE cellular modem module',
  },
  WIFI_BT: {
    label: 'WiFi / BT',
    shortLabel: 'WIFI',
    category: 'Connectivity',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/15',
    borderColor: 'border-blue-500/30',
    description: 'WiFi and Bluetooth antenna connector',
  },
  HDMI: {
    label: 'HDMI',
    shortLabel: 'HDMI',
    category: 'Display',
    color: 'text-zinc-300',
    bgColor: 'bg-zinc-600/30',
    borderColor: 'border-zinc-500/40',
    description: 'HDMI video output connector',
  },
  USB3_1: {
    label: 'USB 3.0 Port 1',
    shortLabel: 'USB3.1',
    category: 'USB',
    color: 'text-yellow-300',
    bgColor: 'bg-yellow-500/15',
    borderColor: 'border-yellow-500/30',
    description: 'USB 3.0 port 1',
    cameraMapping: 'Camera C (70°) — Yellow cable',
  },
  USB3_2: {
    label: 'USB 3.0 Port 2',
    shortLabel: 'USB3.2',
    category: 'USB',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/15',
    borderColor: 'border-purple-500/30',
    description: 'USB 3.0 port 2',
    cameraMapping: 'Camera B (140°) — Purple cable',
  },
  USB3_3: {
    label: 'USB 3.0 Port 3',
    shortLabel: 'USB3.3',
    category: 'USB',
    color: 'text-zinc-300',
    bgColor: 'bg-zinc-600/25',
    borderColor: 'border-zinc-500/40',
    description: 'USB 3.0 port 3 (spare)',
  },
  USB2_1: {
    label: 'USB 2.0 Port 1',
    shortLabel: 'USB2.1',
    category: 'USB',
    color: 'text-zinc-300',
    bgColor: 'bg-zinc-600/25',
    borderColor: 'border-zinc-500/40',
    description: 'USB 2.0 port 1 (spare)',
  },
  USB2_2: {
    label: 'USB 2.0 Port 2',
    shortLabel: 'USB2.2',
    category: 'USB',
    color: 'text-zinc-300',
    bgColor: 'bg-zinc-600/25',
    borderColor: 'border-zinc-500/40',
    description: 'USB 2.0 port 2 (spare)',
  },
  USB2_3: {
    label: 'USB 2.0 Port 3',
    shortLabel: 'USB2.3',
    category: 'USB',
    color: 'text-green-300',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/30',
    description: 'USB 2.0 port 3',
    cameraMapping: 'Camera A (140°) — Green cable',
  },
  IO_LOCK: {
    label: 'IO Lock',
    shortLabel: 'LOCK',
    category: 'IO',
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/30',
    description: 'Door lock trigger connector (IO relay)',
  },
  RS232: {
    label: 'RS-232',
    shortLabel: 'RS232',
    category: 'Serial',
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/15',
    borderColor: 'border-orange-500/30',
    description: 'RS-232 serial communication port',
  },
  RS485: {
    label: 'RS-485',
    shortLabel: 'RS485',
    category: 'Serial',
    color: 'text-amber-300',
    bgColor: 'bg-amber-500/15',
    borderColor: 'border-amber-500/30',
    description: 'RS-485 serial communication port (differential)',
  },
  POWER_MAIN: {
    label: '⚡ Power Main (LEFT — CORRECT)',
    shortLabel: 'PWR✓',
    category: 'Power',
    color: 'text-green-300',
    bgColor: 'bg-green-500/15',
    borderColor: 'border-green-500/50',
    description: 'Main power input — LEFT connector. This is the CORRECT power connector.',
    isCorrectPower: true,
  },
  POWER_2: {
    label: '⚠ Power 2 (RIGHT — DO NOT USE)',
    shortLabel: '⚠PWR2',
    category: 'Power',
    color: 'text-red-300',
    bgColor: 'bg-red-500/15',
    borderColor: 'border-red-500/60',
    description: 'RIGHT power connector — NOT the power input. Common installation error: do NOT plug power here.',
    isDanger: true,
  },
};

// ─────────────────────────────────────────────────────────────
// Mainboard layout — rows for the visual board map
// ─────────────────────────────────────────────────────────────

export const MAINBOARD_LAYOUT: MainboardSection[][] = [
  ['TOP_CONNECTORS'],
  ['CM4'],
  ['CELL_MODULE', 'WIFI_BT', 'HDMI'],
  ['USB3_3', 'USB3_2', 'USB3_1'],
  ['USB2_3', 'USB2_2', 'USB2_1'],
  ['RS232', 'RS485'],
  ['POWER_MAIN', 'POWER_2'],
];

// ─────────────────────────────────────────────────────────────
// Production step names (in order)
// ─────────────────────────────────────────────────────────────

export const PRODUCTION_STEP_NAMES = [
  'Component Sourcing',
  'Camera Assembly and Q&A',
  'Main Board PCBA',
  'Main Board Firmware Load',
  'Main Board Q&A and Assembly',
  'Final Inspection',
  'Shipped to GBX Warehouse',
  'At GBX Warehouse',
  'At FF Warehouse',
  'Vessel',
  'Delivered',
] as const;

// ─────────────────────────────────────────────────────────────
// Product unit status config
// ─────────────────────────────────────────────────────────────

export const PRODUCT_UNIT_STATUS_CONFIG: Record<
  ProductUnitStatus,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  IN_STOCK: {
    label: 'In Stock',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
    dotColor: 'bg-green-400',
  },
  IN_KIT: {
    label: 'In Kit',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
    dotColor: 'bg-blue-400',
  },
  FAULTY: {
    label: 'Faulty',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
    dotColor: 'bg-amber-400',
  },
  RETIRED: {
    label: 'Retired',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10 border border-zinc-400/20',
    dotColor: 'bg-zinc-400',
  },
};

// ─────────────────────────────────────────────────────────────
// Assembled kit status config
// ─────────────────────────────────────────────────────────────

export const ASSEMBLED_KIT_STATUS_CONFIG: Record<
  AssembledKitStatus,
  { label: string; color: string; bgColor: string }
> = {
  ASSEMBLING: {
    label: 'Assembling',
    color: 'text-amber-400',
    bgColor: 'bg-amber-400/10 border border-amber-400/20',
  },
  READY: {
    label: 'Ready',
    color: 'text-green-400',
    bgColor: 'bg-green-400/10 border border-green-400/20',
  },
  DEPLOYED: {
    label: 'Deployed',
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10 border border-blue-400/20',
  },
  RETURNED: {
    label: 'Returned',
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10 border border-purple-400/20',
  },
  RETIRED: {
    label: 'Retired',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-400/10 border border-zinc-400/20',
  },
};

// ─────────────────────────────────────────────────────────────
// Page title map (for header)
// ─────────────────────────────────────────────────────────────

export const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/stock': 'Stock Inventory',
  '/kits': 'Kits',
  '/tickets': 'Tickets',
  '/production': 'Production',
  '/tools/file-converter': 'LOT-TOOL',
};
