import { NextResponse } from "next/server";

const VERCEL_API = "https://api.vercel.com";

export async function POST() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId || !teamId) {
    return NextResponse.json({ error: "Vercel credentials not configured" }, { status: 500 });
  }

  // Get the latest deployment
  const listRes = await fetch(
    `${VERCEL_API}/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1&target=production`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    return NextResponse.json({ error: "Failed to fetch deployments" }, { status: 500 });
  }

  const { deployments } = await listRes.json();
  const latest = deployments?.[0];

  if (!latest) {
    return NextResponse.json({ error: "No deployments found" }, { status: 404 });
  }

  // Trigger a redeploy
  const redeployRes = await fetch(
    `${VERCEL_API}/v13/deployments?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "ivo-kit-manager",
        deploymentId: latest.uid,
        target: "production",
      }),
    }
  );

  if (!redeployRes.ok) {
    const err = await redeployRes.json();
    return NextResponse.json({ error: err.error?.message ?? "Redeploy failed" }, { status: 500 });
  }

  const data = await redeployRes.json();

  return NextResponse.json({
    url: `https://gbx-ivo-control.vercel.app`,
    deploymentId: data.id,
  });
}
