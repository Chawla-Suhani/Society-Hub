// The contract between the API and the UI. Route handlers build these shapes (see lib/dto.ts)
// and the React screens read them, so both sides are checked against the same types.
export type Role = 'admin' | 'resident' | 'guard';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
export type ResidentType = 'owner' | 'tenant' | 'family';

export interface Me {
  id: number;
  role: Role;
  status: UserStatus;
  fullName: string;
  email: string | null;
  phone: string | null;
  residentType: ResidentType | null;
  rejectReason: string | null;
  totpEnabled: boolean;
  passkeyCount: number;
  mfaSetupRequired: boolean;
  society: { id: number; name: string; code?: string };
  flat: { id: number; label: string; floor: number; wing: string; wingId: number } | null;
}

export interface FlatRef { id: number; label: string; floor: number }
export interface WingWithFlats { id: number; name: string; floors?: number; flats: FlatRef[] }

export interface Wing { id: number; name: string; floors: number; flatsPerFloor: number; flatCount: number; residentCount: number }
export interface FlatWithResidents {
  id: number; label: string; floor: number;
  residents: Array<{ id: number; fullName: string; status: UserStatus; residentType: ResidentType | null }>;
}

export interface Overview {
  pendingApprovals: number; activeResidents: number; openComplaints: number; visitorsInside: number;
  unpaidBills: number; overdueBills: number; outstandingAmount: number;
}

export interface ResidentRow {
  id: number; fullName: string; email: string | null; phone: string | null; status: UserStatus; residentType: ResidentType | null;
  proofNote: string | null; rejectReason: string | null; createdAt: string; flatId: number | null;
  flat: string; wing: string; flatConflict: string | null;
}
export interface GuardRow { id: number; fullName: string; phone: string | null; status: UserStatus; createdAt: string; signedIn: boolean }
export interface AuditLogRow { id: number; action: string; target: string | null; meta: string | null; createdAt: string; actor: string | null }

export type PassStatus = 'APPROVED' | 'AWAITING_APPROVAL' | 'REJECTED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'EXPIRED';
export interface VisitorPassDto {
  id: number; flat: string; flatId: number; visitorName: string; visitorPhone: string | null; purpose: string | null;
  code: string; source: 'invite' | 'walkin'; status: PassStatus; expiresAt: string;
  checkedInAt: string | null; checkedOutAt: string | null; createdAt: string; createdByName: string;
}

export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export interface ComplaintDto {
  id: number; flat: string | null; raisedBy: string; userId: number; category: string; title: string;
  description: string | null; status: ComplaintStatus; assignedTo: string | null; hasPhoto: boolean;
  createdAt: string; updatedAt: string;
}
export interface CommentDto { id: number; body: string; createdAt: string; author: string; authorRole: Role }

export interface NoticeDto { id: number; title: string; body: string; pinned: boolean; wing: string | null; postedBy: string; createdAt: string }

export interface BillDto {
  id: number; flat: string; flatId: number; wing: string; period: string; amount: number; dueDate: string;
  status: 'UNPAID' | 'PAID'; paidAt: string | null; method: string | null; paymentRef: string | null; overdue: boolean;
}
export interface Defaulter { flatId: number; flat: string; wing: string; months: number; amount: number; oldestDue: string }

export interface PasskeyRow { id: number; label: string | null; createdAt: string }
export interface SessionRow { id: string; userAgent: string | null; ip: string | null; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean }
