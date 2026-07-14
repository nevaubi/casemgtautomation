import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import type { Scorecard, FragilityResult } from "@/lib/matrix";
import type { Manifest } from "@/lib/demo";

/**
 * Case assessment memo.
 *
 * This is the one place a language model is allowed to talk about the score —
 * and it is allowed to *describe* it, never to compute it. The model receives
 * the finished scorecard and writes the memo a senior associate would write from
 * it. It cannot change a number, because it never sees the records; it only sees
 * the result.
 *
 * And it is verified the same way everything else in this pipeline is verified.
 * The extraction stage checks every quote against the page it cites. This checks
 * every FIGURE in the memo against the scorecard it was given. A number the
 * scorecard does not contain is a fabricated number, it is reported as such, and
 * the reader sees the warning rather than the fabrication.
 */

export const maxDuration = 300;

const SYSTEM = `You are a senior associate at a plaintiff-side mass tort firm, writing an internal case assessment from a completed settlement-matrix scorecard.

You are given the scorecard as JSON. It is the output of a deterministic rules engine. It is the truth. Your job is to explain it to a partner who has ninety seconds.

ABSOLUTE RULES:
1. Every figure you write — points, tiers, dates, measurements, counts, percentages — must appear in the scorecard you were given. Do not calculate new ones. Do not round differently. Do not estimate. If you want to say a case is "worth" something, say the tier, because that is what the scorecard contains.
2. You did not score this case and you may not re-score it. If you disagree with the engine, that is not your call; describe what it found.
3. Never state a fact about the medical record that is not in the scorecard's findings. You have not read the chart.
4. An INDETERMINATE factor means the records cannot answer it. Do not describe it as a weakness in the case — it is a gap in the file, and those are different things, and the difference is the entire point.
5. Do not predict a settlement amount. Do not express a probability of success. You are describing a matrix position, not valuing a claim.

STRUCTURE — no headings, no bullets, four short paragraphs:
- Where the case stands: matrix position, tier, and the honest version — what the evidence-adjusted score says about how well the file actually proves it.
- What carries the case: the two or three factors doing the most work, and how well they are corroborated.
- What breaks it: the fragility analysis. Name the single document whose loss costs a tier, and say plainly that this is what the defence will attack.
- What to do next: the ranked record requests, by expected value. If a request carries a downside, say so — a partner needs to know that going looking for pre-exposure records can find the very history that hurts you.

Write in plain, unhedged prose. No throat-clearing. No "it is important to note". A partner reads this while walking to a meeting.`;

interface Body {
  scorecard: Scorecard;
  fragility: FragilityResult[];
  matter: Manifest["matter"];
}

/** Every number the scorecard actually contains — the memo may use these and no others. */
function allowedNumbers(payload: unknown): Set<string> {
  const out = new Set<string>();
  const json = JSON.stringify(payload);
  for (const m of json.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    out.add(String(n));
    out.add(String(Math.abs(n)));
    if (Number.isFinite(n)) {
      out.add(String(Math.round(n)));
      out.add(String(Math.round(n * 100))); // strengths quoted as percentages
      out.add(String(Math.round(Math.abs(n) * 100)));
    }
  }
  return out;
}

/** Figures in the memo that the scorecard cannot account for. */
function ungroundedFigures(memo: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of memo.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, "");
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    // Ordinals and small enumerations ("the two factors", "first") are prose, not claims.
    if (Number.isInteger(n) && Math.abs(n) <= 3) continue;
    if (allowed.has(String(n)) || allowed.has(String(Math.round(n)))) continue;
    bad.push(m[0]);
  }
  return [...new Set(bad)];
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on this deployment." },
      { status: 501 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
    if (!body?.scorecard?.factors) throw new Error("bad shape");
  } catch {
    return NextResponse.json({ error: "Expected { scorecard, fragility, matter }" }, { status: 400 });
  }

  const payload = {
    matter: body.matter,
    scorecard: body.scorecard,
    fragility: body.fragility,
  };

  const client = new Anthropic();
  let memo = "";
  try {
    const msg = await client.messages
      .stream({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content:
              `Write the case assessment for ${body.matter?.name ?? "this matter"}.\n\n` +
              `SCORECARD:\n${JSON.stringify(payload, null, 1)}`,
          },
        ],
      })
      .finalMessage();
    memo = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (e) {
    return NextResponse.json(
      { error: `Memo generation failed: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }

  const ungrounded = ungroundedFigures(memo, allowedNumbers(payload));

  return NextResponse.json({
    memo,
    verified: ungrounded.length === 0,
    // Not swallowed. If the model invented a figure, the reader is told which one.
    ungroundedFigures: ungrounded,
    checkedAgainst: `${body.scorecard.matrixName} v${body.scorecard.matrixVersion}`,
  });
}
