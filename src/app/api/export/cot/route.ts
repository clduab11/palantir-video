import { NextResponse } from "next/server";

import { exportCotXml, type CotExportMode } from "@/lib/interop/cot";
import { ApprovalGrantSchema } from "@/lib/policy/action-policy";
import { secretShapedRejection } from "@/lib/policy/secret-guard";
import { ingestAndSynthesize } from "@/lib/tise";
import { adaptInbound } from "@/lib/synactic/adapter";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "REJECTED: body is not JSON" }, { status: 400 });
  }

  const record =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!record) {
    return NextResponse.json({ error: "REJECTED: expected an object" }, { status: 400 });
  }

  const blocked = secretShapedRejection(record);
  if (blocked) {
    return NextResponse.json(blocked, { status: 400 });
  }

  const mode: CotExportMode = record.mode === "nomination" ? "nomination" : "awareness";
  const grantParsed = record.approval
    ? ApprovalGrantSchema.safeParse(record.approval)
    : null;
  if (record.approval && !grantParsed?.success) {
    return NextResponse.json(
      { error: "REJECTED: approval grant is malformed" },
      { status: 400 },
    );
  }

  const now = new Date();
  const synthesis = ingestAndSynthesize(adaptInbound(record.events ?? record), {
    now,
  });
  const outcome = exportCotXml({
    synthesis,
    mode,
    approvalGrant: grantParsed?.success ? grantParsed.data : null,
    now,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: outcome.policyDecision.message,
        policy: outcome.policyDecision,
        audit: outcome.auditRecord,
      },
      { status: 403 },
    );
  }

  return NextResponse.json({
    xml: outcome.xml,
    eventCount: outcome.eventCount,
    policy: outcome.policyDecision,
    audit: outcome.auditRecord,
    consumedGrant: outcome.consumedGrant,
    posture: synthesis.sitrep.recommendedPosture,
  });
}
