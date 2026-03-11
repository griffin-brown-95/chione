import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return new NextResponse('Invalid link', { status: 400 });

  const result = await sql`
    UPDATE subscribers
    SET confirmed = true
    WHERE token = ${token}::uuid AND confirmed = false
    RETURNING email
  `;

  if (result.length === 0) {
    return new NextResponse('Link already used or invalid', { status: 400 });
  }

  return new NextResponse(`
    <html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
        <h2>You're subscribed! ✓</h2>
        <p style="color: #475569;">You'll receive the Chione weekly digest every Monday morning.</p>
        <a href=${process.env.BASE_URL} style="color: #3b82f6;">View calendar →</a>
    </body></html>
`, { headers: { 'Content-Type': 'text/html' } });
}