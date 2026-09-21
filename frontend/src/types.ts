export interface LocationItem {
  id: number;
  name: string;
  parentLocationId: number | null;
}

export interface EquipmentType {
  id: number;
  name: string;
}

export interface EquipmentName {
  id: number;
  name: string;
  equipmentTypeId: number;
  equipmentTypeName: string;
}

export interface EquipmentUnit {
  id: number;
  equipmentNameId: number;
  equipmentNameName: string;
  equipmentTypeName: string;
  serialNumber: string;
  inventoryNumber: string | null;
  note: string | null;
  locationId: number;
}

export interface Account {
  id: number;
  login: string;
  fullName: string;
  roles: string[];
}

export interface HistoryEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  changesJson: string;
  accountLogin: string;
  timestampUtc: string;
}

export interface AuthUser {
  token: string;
  login: string;
  fullName: string;
  roles: string[];
}

export interface RepairOperation {
  id: number;
  name: string;
}

export interface SparePart {
  id: number;
  name: string;
  quantity: number;
}

export interface RepairPart {
  sparePartId: number;
  name: string;
  quantity: number;
}

export interface Repair {
  id: number;
  date: string; // yyyy-MM-dd
  note: string | null;
  accountLogin: string;
  createdUtc: string;
  modifiedUtc: string | null;
  modifiedByLogin: string | null;
  operations: RepairOperation[];
  parts: RepairPart[];
}

export interface SparePartWriteOff {
  id: number;
  date: string; // yyyy-MM-dd
  kind: 'Repair' | 'Issue';
  sparePartId: number;
  sparePartName: string;
  quantity: number;
  accountLogin: string;
  createdUtc: string;
  modifiedUtc: string | null;
  modifiedByLogin: string | null;
  recipient: string | null;
  repairId: number | null;
  equipmentUnitId: number | null;
  equipmentUnitTitle: string | null;
  issueId: number | null;
}

// Строка общего списка ремонтов (страница «Ремонты»)
export interface RepairListItem {
  id: number;
  date: string; // yyyy-MM-dd
  equipmentUnitId: number;
  equipmentUnitTitle: string;
  inventoryNumber: string | null;
  note: string | null;
  accountLogin: string;
  createdUtc: string;
  modifiedUtc: string | null;
  modifiedByLogin: string | null;
  operations: RepairOperation[];
  parts: RepairPart[];
}

// Выдача расходных частей (не в ремонт)
export interface SparePartIssue {
  id: number;
  date: string; // yyyy-MM-dd
  recipient: string;
  accountLogin: string;
  createdUtc: string;
  modifiedUtc: string | null;
  modifiedByLogin: string | null;
  parts: RepairPart[];
}

// --- Инвентаризация ---
export interface InventorySummary {
  id: number;
  startedUtc: string;
  startedByLogin: string;
  endedUtc: string | null;
  endedByLogin: string | null;
  isActive: boolean;
  totalUnits: number;
  confirmedUnits: number;
}

export interface InventoryConfirmation {
  equipmentUnitId: number;
  confirmedUtc: string;
  confirmedByLogin: string;
}

export interface ActiveInventory {
  inventory: InventorySummary | null;
  confirmations: InventoryConfirmation[];
}

export interface InventoryUnresolvedUnit {
  equipmentUnitId: number | null;
  typeName: string;
  name: string;
  serialNumber: string;
  inventoryNumber: string | null;
  note: string | null;
  locationPath: string;
}

export interface InventoryDetails {
  inventory: InventorySummary;
  unresolved: InventoryUnresolvedUnit[];
}
