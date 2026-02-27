import { NextResponse } from 'next/server';

const VERCEL_API = 'https://api.vercel.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deploymentId = searchParams.get('id');

  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !teamId) {
    return NextResponse.json({ error: 'Vercel credentials not configured' }, { status: 500 });
  }

  if (!deploymentId) {
    return NextResponse.json({ error: 'Missing deployment id' }, { status: 400 });
  }

  // Get deployment status
  const [statusRes, eventsRes] = await Promise.all([
    fetch(`${VERCEL_API}/v13/deployments/${deploymentId}?teamId=${teamId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`${VERCEL_API}/v2/deployments/${deploymentId}/events?teamId=${teamId}&limit=30`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  const statusData = await statusRes.json();
  const eventsData = eventsRes.ok ? await eventsRes.json() : { events: [] };

  const logs: string[] = (eventsData as { text?: string; payload?: { text?: string } }[])
    .filter((e) => e.text || e.payload?.text)
    .map((e) => e.text ?? e.payload?.text ?? '')
    .filter(Boolean)
    .slice(-20); // last 20 lines

  return NextResponse.json({
    state: statusData.readyState ?? statusData.status ?? 'UNKNOWN',
    url: statusData.url ? `https://${statusData.url}` : null,
    logs,
  });
}
