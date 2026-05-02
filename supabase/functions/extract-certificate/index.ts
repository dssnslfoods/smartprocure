// Extract certificate fields from an uploaded file (PDF or image) using Claude.
// Body: { file_base64: string, mime_type: string }
// Returns: { certificate_type, certificate_no, issued_by, issued_date, expiry_date, confidence, raw }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You read food-safety / quality certificates (GMP, HACCP, ISO22000, ISO9001, BRC, BRCGS, SQF, FSSC22000, Halal, Kosher, Organic, FDA, อย., etc.).

Look at the document and extract these fields. Output ONLY valid JSON, no prose, no markdown fences:

{
  "certificate_type": "GMP|ISO22000|HACCP|ISO9001|BRC|SQF|Halal|Kosher|Organic|FDA|อย.|<other>" (string, normalize to one of the listed if matches),
  "certificate_no":   "<the cert number / registration number>" (string or null),
  "issued_by":        "<issuing body / certification body / authority>" (string or null),
  "issued_date":      "YYYY-MM-DD" (string or null),
  "expiry_date":      "YYYY-MM-DD" (string or null),
  "confidence":       "high|medium|low",
  "notes":            "<short note on language, anything ambiguous, or empty>"
}

Date rules:
- Convert any format (DD/MM/YYYY, Thai BE 25xx, "31 ธันวาคม 2569", "Dec 31, 2026") to ISO YYYY-MM-DD AD.
- Thai Buddhist Era (year > 2400) → subtract 543.
- If only month/year shown, use the last day of that month for expiry, first day for issue.
- If a date cannot be confidently determined, return null (not a guess).

Type rules:
- Match case-insensitively. "BRCGS" → "BRC". "ISO 22000" → "ISO22000". "GMP+" → "GMP".
- If clearly something else (e.g. "Rainforest Alliance"), use that exact name.

If the document is clearly NOT a certificate, return all fields null with confidence "low" and a note.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const { file_base64, mime_type } = await req.json();
    if (!file_base64 || !mime_type) {
      return json({ error: "missing file_base64 or mime_type" }, 400);
    }

    const isPdf   = mime_type === "application/pdf";
    const isImage = mime_type.startsWith("image/");
    if (!isPdf && !isImage) {
      return json({ error: `unsupported mime_type: ${mime_type}` }, 400);
    }

    // Build content block — Claude accepts both image and document source.base64
    const contentBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: file_base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mime_type, data: file_base64 },
        };

    const anthRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              contentBlock,
              { type: "text", text: "Extract the certificate fields. Return ONLY the JSON object." },
            ],
          },
        ],
      }),
    });

    if (!anthRes.ok) {
      const errText = await anthRes.text();
      console.error("Anthropic error:", errText);
      return json({ error: "AI extraction failed", detail: errText }, 502);
    }

    const data = await anthRes.json();
    const text = data?.content?.[0]?.text ?? "";

    // Strip any code fences if Claude added them
    const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "AI returned non-JSON response", raw: text }, 502);
    }

    return json({
      certificate_type: parsed.certificate_type ?? null,
      certificate_no:   parsed.certificate_no   ?? null,
      issued_by:        parsed.issued_by        ?? null,
      issued_date:      parsed.issued_date      ?? null,
      expiry_date:      parsed.expiry_date      ?? null,
      confidence:       parsed.confidence       ?? "medium",
      notes:            parsed.notes            ?? "",
    });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
