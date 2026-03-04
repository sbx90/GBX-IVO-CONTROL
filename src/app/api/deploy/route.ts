import { NextResponse } from "next/server";

const VERCEL_API = "https://api.vercel.com";

export async function POST() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const gitRepo = process.env.VERCEL_GIT_REPO ?? "sbx90/GBX-IVO-CONTROL";
  const gitBranch = process.env.VERCEL_GIT_BRANCH ?? "main";

  if (!token || !projectId || !teamId) {
    return NextResponse.json({ error: "Vercel credentials not configured" }, { status: 500 });
  }

  // Trigger a new deployment from the latest Git commit
  const deployRes = await fetch(
    `${VERCEL_API}/v13/deployments?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "ivo-kit-manager",
        project: projectId,
        target: "production",
        gitSource: {
          type: "github",
          repo: gitRepo,
          ref: gitBranch,
        },
      }),
    }
  );

  if (!deployRes.ok) {
    const err = await deployRes.json();
    return NextResponse.json({ error: err.error?.message ?? "Deploy failed" }, { status: 500 });
  }

  const data = await deployRes.json();

  return NextResponse.json({
    url: `https://gbx-ivo-control.vercel.app`,
    deploymentId: data.id,
  });
}
