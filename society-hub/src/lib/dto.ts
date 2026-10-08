import type { Bill, Complaint, Flat, Notice, User, VisitorPass, Wing } from '@/generated/prisma/client';
import type { BillDto, ComplaintDto, NoticeDto, PassStatus, VisitorPassDto } from '@/types/api';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

// A pass whose time ran out shows as EXPIRED without needing a background job.
export function passDto(p: VisitorPass & { flat: Flat; createdBy: User }): VisitorPassDto {
  const status: PassStatus = p.status === 'APPROVED' && p.expiresAt < new Date() ? 'EXPIRED' : p.status;
  return {
    id: p.id, flat: p.flat.label, flatId: p.flatId, visitorName: p.visitorName, visitorPhone: p.visitorPhone, purpose: p.purpose,
    code: p.code, source: p.source, status, expiresAt: p.expiresAt.toISOString(),
    checkedInAt: iso(p.checkedInAt), checkedOutAt: iso(p.checkedOutAt), createdAt: p.createdAt.toISOString(), createdByName: p.createdBy.fullName,
  };
}

export function complaintDto(c: Complaint & { user: User; flat: Flat | null }): ComplaintDto {
  return {
    id: c.id, flat: c.flat?.label ?? null, raisedBy: c.user.fullName, userId: c.userId, category: c.category, title: c.title,
    description: c.description, status: c.status, assignedTo: c.assignedTo, hasPhoto: Boolean(c.photoFile),
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

export function noticeDto(n: Notice & { wing: Wing | null; createdBy: User }): NoticeDto {
  return { id: n.id, title: n.title, body: n.body, pinned: n.pinned, wing: n.wing?.name ?? null, postedBy: n.createdBy.fullName, createdAt: n.createdAt.toISOString() };
}

export function billDto(b: Bill & { flat: Flat & { wing: Wing } }): BillDto {
  return {
    id: b.id, flat: b.flat.label, flatId: b.flatId, wing: b.flat.wing.name, period: b.period, amount: b.amount,
    dueDate: b.dueDate.toISOString(), status: b.status, paidAt: iso(b.paidAt), method: b.method, paymentRef: b.paymentRef,
    overdue: b.status === 'UNPAID' && b.dueDate < new Date(),
  };
}
