// Demo data so every screen has something to show.   npm run seed
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import { randomCode } from '../src/lib/crypto';
import type { PassStatus } from '../src/generated/prisma/client';

async function main() {
  if (await db.society.findUnique({ where: { code: 'DEMO-2026' } })) {
    console.log('Demo society already exists. Delete the database file and migrate again to start fresh.');
    return;
  }
  const PASSWORD = 'Demo@1234';
  const hash = await bcrypt.hash(PASSWORD, 10);
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

  const society = await db.society.create({ data: { name: 'Green Meadows', code: 'DEMO-2026', address: 'Kalewadi Phata', city: 'Pimpri-Chinchwad, Pune' } });
  const sid = society.id;

  // wings + flats
  const wings: Record<string, number> = {};
  for (const [name, floors, per] of [['A', 5, 4], ['B', 4, 4]] as Array<[string, number, number]>) {
    const w = await db.wing.create({ data: { societyId: sid, name, floors, flatsPerFloor: per } });
    wings[name] = w.id;
    const flats = [];
    for (let f = 1; f <= floors; f++) for (let n = 1; n <= per; n++) flats.push({ societyId: sid, wingId: w.id, floor: f, label: `${name}-${f}${String(n).padStart(2, '0')}` });
    await db.flat.createMany({ data: flats });
  }
  const flatId = async (label: string): Promise<number> => (await db.flat.findFirstOrThrow({ where: { societyId: sid, label } })).id;

  const admin = await db.user.create({ data: { societyId: sid, role: 'admin', status: 'ACTIVE', fullName: 'Meera Kulkarni', email: 'admin@demo.test', phone: '9000000001', passwordHash: hash } });
  await db.user.create({ data: { societyId: sid, role: 'guard', status: 'ACTIVE', fullName: 'Ganesh Pawar', phone: '9000000011', pinHash: await bcrypt.hash('123456', 10) } });
  await db.user.create({ data: { societyId: sid, role: 'guard', status: 'ACTIVE', fullName: 'Sunil Jadhav', phone: '9000000012', pinHash: await bcrypt.hash('654321', 10) } });

  const people: Array<[string, string, string, string, 'owner' | 'tenant' | 'family']> = [
    ['Rohan Deshmukh', 'resident@demo.test', '9000000101', 'A-101', 'owner'],
    ['Priya Joshi', 'priya@demo.test', '9000000102', 'A-102', 'owner'],
    ['Aman Shaikh', 'aman@demo.test', '9000000103', 'A-203', 'tenant'],
    ['Kavita Rao', 'kavita@demo.test', '9000000104', 'A-304', 'owner'],
    ['Nikhil Patil', 'nikhil@demo.test', '9000000105', 'B-101', 'owner'],
    ['Sneha Iyer', 'sneha@demo.test', '9000000106', 'B-202', 'tenant'],
    ['Farhan Khan', 'farhan@demo.test', '9000000107', 'B-303', 'owner'],
    ['Divya Nair', 'divya@demo.test', '9000000108', 'A-402', 'owner'],
  ];
  const residents: Record<string, number> = {};
  for (const [fullName, email, phone, flat, residentType] of people) {
    const u = await db.user.create({ data: { societyId: sid, role: 'resident', status: 'ACTIVE', fullName, email, phone, passwordHash: hash, flatId: await flatId(flat), residentType } });
    residents[flat] = u.id;
  }
  // waiting for approval
  const pending: Array<[string, string, string, string, 'owner' | 'tenant' | 'family', string]> = [
    ['Tanvi Mehta', 'tanvi@demo.test', '9000000201', 'B-402', 'tenant', 'Rent agreement uploaded to committee'],
    ['Omkar Bhosale', 'omkar@demo.test', '9000000202', 'A-501', 'owner', 'Registered sale deed, March 2026'],
    ['Zoya Ansari', 'zoya@demo.test', '9000000203', 'B-104', 'family', 'Daughter of the flat owner'],
  ];
  for (const [fullName, email, phone, flat, residentType, proofNote] of pending) {
    await db.user.create({ data: { societyId: sid, role: 'resident', status: 'PENDING', fullName, email, phone, passwordHash: hash, flatId: await flatId(flat), residentType, proofNote } });
  }

  // visitors
  const pass = async (flat: string, visitorName: string, purpose: string, status: PassStatus, extra: { checkedInAt?: Date; checkedOutAt?: Date; expiresAt?: Date } = {}) =>
    db.visitorPass.create({ data: { societyId: sid, flatId: await flatId(flat), createdById: residents[flat], visitorName, purpose, code: randomCode(8), source: 'invite', status, expiresAt: extra.expiresAt ?? new Date(Date.now() + 6 * 3600 * 1000), checkedInAt: extra.checkedInAt, checkedOutAt: extra.checkedOutAt } });
  await pass('A-101', 'Swiggy delivery', 'Food', 'CHECKED_OUT', { checkedInAt: hoursAgo(5), checkedOutAt: hoursAgo(4.8), expiresAt: hoursAgo(2) });
  await pass('A-102', 'Urban Company', 'AC service', 'CHECKED_IN', { checkedInAt: hoursAgo(1) });
  await pass('B-101', 'Mom and Dad', 'Family visit', 'APPROVED');
  await pass('A-101', 'Plumber', 'Tap repair', 'APPROVED');

  // complaints
  const complaint = async (flat: string, description: string, category: string, title: string, status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED', assignedTo?: string) =>
    db.complaint.create({ data: { societyId: sid, flatId: await flatId(flat), userId: residents[flat], category, title, description, status, assignedTo, createdAt: hoursAgo(30) } });
  const c1 = await complaint('A-101', 'Water dripping from the ceiling near the bathroom.', 'Plumbing', 'Leak in bathroom ceiling', 'IN_PROGRESS', 'Plumber');
  await complaint('B-202', 'Lift stops between floors 2 and 3 once a day.', 'Lift', 'Lift B stuck intermittently', 'OPEN');
  await complaint('A-304', 'Two-wheelers parked in the visitor bay overnight.', 'Parking', 'Visitor parking misuse', 'OPEN');
  await complaint('B-303', 'Stairwell light on 3rd floor replaced.', 'Electrical', 'Stairwell light not working', 'RESOLVED', 'Electrician');
  await db.complaintComment.createMany({
    data: [
      { complaintId: c1.id, userId: admin.id, body: 'Plumber will visit tomorrow between 10 and 12.' },
      { complaintId: c1.id, userId: residents['A-101'], body: 'Thanks, someone will be home.' },
    ],
  });

  // notices
  await db.notice.createMany({
    data: [
      { societyId: sid, title: 'Water tank cleaning on Sunday', body: 'Water supply will be off from 10 am to 2 pm. Please store water in advance.', pinned: true, createdById: admin.id },
      { societyId: sid, wingId: wings.A, title: 'Wing A: lift servicing', body: 'Lift 1 will be under maintenance on Saturday morning. Please use Lift 2.', createdById: admin.id },
      { societyId: sid, title: 'Annual general meeting', body: 'AGM is on the last Saturday of this month at 6 pm in the clubhouse.', createdById: admin.id },
    ],
  });

  // bills: last 3 months, most flats paid, a few overdue
  const flats = await db.flat.findMany({ where: { societyId: sid } });
  const now = new Date();
  let i = 0;
  for (let m = 2; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = new Date(d.getFullYear(), d.getMonth(), 10, 23, 59, 59);
    await db.bill.createMany({
      data: flats.map((f) => {
        i++;
        const paid = m === 0 ? i % 3 === 0 : i % 7 !== 0;
        return {
          societyId: sid, flatId: f.id, period, amount: 2500, dueDate,
          status: paid ? ('PAID' as const) : ('UNPAID' as const),
          paidAt: paid ? new Date(dueDate.getTime() - 3 * 86400000) : null,
          method: paid ? 'ONLINE_TEST' : null,
          paymentRef: paid ? `TEST-${randomCode(10)}` : null,
        };
      }),
    });
  }

  console.log(`
Demo society created. Society code: DEMO-2026   (password for everyone: ${PASSWORD})

  Admin     admin@demo.test      (asks you to set up 2FA on first login)
  Resident  resident@demo.test   (A-101)
  Guard     9000000011 / PIN 123456
  3 pending residents are waiting for approval in the admin panel.
`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
