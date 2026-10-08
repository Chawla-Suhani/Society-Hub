import { db } from '@/lib/db';
import { route } from '@/lib/http';
import type { Overview } from '@/types/api';

export const GET = route({ roles: ['admin'] }, async ({ user }) => {
  const s = user.societyId;
  const now = new Date();
  const [pendingApprovals, activeResidents, openComplaints, visitorsInside, unpaid] = await Promise.all([
    db.user.count({ where: { societyId: s, role: 'resident', status: 'PENDING' } }),
    db.user.count({ where: { societyId: s, role: 'resident', status: 'ACTIVE' } }),
    db.complaint.count({ where: { societyId: s, status: { not: 'RESOLVED' } } }),
    db.visitorPass.count({ where: { societyId: s, status: 'CHECKED_IN' } }),
    db.bill.findMany({ where: { societyId: s, status: 'UNPAID' }, select: { dueDate: true, amount: true } }),
  ]);
  const out: Overview = {
    pendingApprovals, activeResidents, openComplaints, visitorsInside,
    unpaidBills: unpaid.length,
    overdueBills: unpaid.filter((b) => b.dueDate < now).length,
    outstandingAmount: unpaid.reduce((t, b) => t + b.amount, 0),
  };
  return out;
});
