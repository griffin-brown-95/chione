import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return new NextResponse('Invalid link', { status: 400 });

  await sql`DELETE FROM subscribers WHERE token = ${token}::uuid`;

  return new NextResponse(`
    <html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
      <h2>Unsubscribed.</h2>
      <p style="color: #475569;">You've been removed from the Chione digest.</p>
      <a href="${process.env.BASE_URL}" style="color: #3b82f6;">View calendar →</a>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } });
}