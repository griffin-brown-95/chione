import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email, name } = await req.json();

  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  try {
    const result = await sql`
      INSERT INTO subscribers (email, name)
      VALUES (${email}, ${name ?? null})
      ON CONFLICT (email) DO NOTHING
      RETURNING token
    `;

    if (result.length === 0) {
      return NextResponse.json({ message: 'Already subscribed' });
    }

    // hardcoded values for now
    const baseUrl = process.env.BASE_URL!;
    const token = result[0].token as string;
    const confirmUrl = baseUrl + '/api/confirm?token=' + token;

    await resend.emails.send({
      from: 'Chione <onboarding@resend.dev>',
      to: email,
      subject: 'Confirm your Chione subscription',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #0f172a;">You're almost in.</h2>
          <p style="color: #475569;">Click below to confirm your subscription to the Chione weekly digest — a roundup of upcoming winter Olympic events.</p>
          <a href="${confirmUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #3b82f6; color: white; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Confirm subscription
          </a>
          <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ message: 'Confirmation email sent' });
  } catch (err) {
    console.error('Subscribe error:', err);
    console.log('[subscribe] BASE_URL:', process.env.NEXT_PUBLIC_BASE_URL);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}