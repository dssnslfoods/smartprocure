// Extract certificate fields from an uploaded file (PDF or image) using Google Gemini.
// Body: { file_base64: string, mime_type: string }
// Returns: { certificate_type, certificate_no, issued_by, issued_date, expiry_date, confidence, notes }
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

const MODEL = "gemini-2.5-flash";  // free tier, supports vision + PDF

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY not configured" }, 500);
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const reqBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: mime_type, data: file_base64 } },
          { text: "Extract the certificate fields. Return ONLY the JSON object." },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 1024,
      },
    };

    const gemRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    if (!gemRes.ok) {
      const errText = await gemRes.text();
      console.error("Gemini error:", errText);
      return json({ error: "AI extraction failed", detail: errText }, 502);
    }

    const data = await gemRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip any code fences if present
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
