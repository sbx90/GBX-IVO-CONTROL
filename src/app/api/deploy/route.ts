import { NextResponse } from "next/server";

const VERCEL_API = "https://api.vercel.com";

export async function POST() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  const gitBranch = process.env.VERCEL_GIT_BRANCH ?? "main";

  if (!token || !projectId || !teamId) {
    return NextResponse.json({ error: "Vercel credentials not configured" }, { status: 500 });
  }

  // Fetch numeric repoId from GitHub public API (required by Vercel v13 gitSource)
  const gitRepo = process.env.VERCEL_GIT_REPO ?? "sbx90/GBX-IVO-CONTROL";
  const ghRes = await fetch(`https://api.github.com/repos/${gitRepo}`, {
    headers: { "User-Agent": "ivo-kit-manager" },
  });
  if (!ghRes.ok) {
    return NextResponse.json({ error: `Failed to fetch GitHub repo info for ${gitRepo}` }, { status: 500 });
  }
  const ghData = await ghRes.json();
  const repoId = ghData.id as number;

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
          repoId,
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
