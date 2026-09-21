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
  operations: RepairOperation[];
  parts: RepairPart[];
}
