import PDFDocument from 'pdfkit';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { loadBill } from '@/lib/bills';

export const GET = route({ roles: ['admin', 'resident'] }, async ({ user, params }) => {
  const b = await loadBill(user, params.id);
  if (b.status !== 'PAID') throw new ApiError(400, 'Receipt is available after payment', 'VALIDATION');
  const society = await db.society.findUniqueOrThrow({ where: { id: user.societyId } });

  const pdf = new PDFDocument({ size: 'A5', margin: 40 });
  const chunks: Buffer[] = [];
  pdf.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve) => pdf.on('end', () => resolve()));

  pdf.fontSize(18).text(society.name, { align: 'center' });
  pdf.fontSize(10).fillColor('#555').text('Maintenance payment receipt', { align: 'center' }).moveDown(1.5);
  pdf.fillColor('#000').fontSize(12);
  const line = (k: string, v: unknown) => pdf.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v));
  line('Flat', b.flat.label);
  line('Period', b.period);
  line('Amount paid', `Rs. ${b.amount}`);
  line('Paid on', (b.paidAt ?? new Date()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
  line('Method', b.method ?? '-');
  line('Reference', b.paymentRef || '-');
  pdf.moveDown(2).fontSize(9).fillColor('#777').text('This is a computer-generated receipt.', { align: 'center' });
  pdf.end();
  await finished;

  return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="receipt-${b.flat.label}-${b.period}.pdf"` },
  });
});
