// Extract supplier information from a quotation document (PDF or image) using Google Gemini.
// Body: { file_base64: string, mime_type: string }
// Returns: { company_name, tax_id, address, city, country, phone, email, website, contact_person, confidence, notes }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You read quotation documents, invoices, purchase orders, business cards, or any commercial document from suppliers/vendors.

Look at the document and extract the SUPPLIER (seller/vendor) company information. Output ONLY valid JSON, no prose, no markdown fences:

{
  "company_name":   "<legal company name of the seller/vendor>" (string or null),
  "tax_id":         "<tax ID / VAT number / เลขประจำตัวผู้เสียภาษี>" (string or null),
  "address":        "<full street address>" (string or null),
  "city":           "<city / จังหวัด>" (string or null),
  "country":        "<country name>" (string or null, default "Thailand" if Thai document),
  "phone":          "<phone number(s)>" (string or null),
  "email":          "<email address>" (string or null),
  "website":        "<website URL>" (string or null),
  "contact_person": "<contact person name if visible>" (string or null),
  "confidence":     "high|medium|low",
  "notes":          "<short note on anything ambiguous or notable>"
}

Rules:
- Extract the SUPPLIER/SELLER/VENDOR info, NOT the buyer/customer.
- For Thai documents: the seller is typically at the top or in the "ผู้ขาย" / "บริษัท" section.
- Tax ID: look for "เลขประจำตัวผู้เสียภาษี", "Tax ID", "VAT No.", or a 13-digit number.
- Phone: include all numbers found (comma-separated if multiple).
- Address: combine all address parts into one string. Include postal code if visible.
- City: extract province/จังหวัด separately from the full address.
- If the document is clearly NOT a commercial document, return all fields null with confidence "low".
- If you can only partially read the document, extract what you can and set confidence to "medium".`;

const MODEL = "gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json("ok", 200);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY not configured" }, 500);
    }

    const { file_base64, mime_type } = await req.json();
    if (!file_base64 || !mime_type) {
      return json({ error: "missing file_base64 or mime_type" }, 400);
    }

    const isPdf = mime_type === "application/pdf";
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
          { text: "Extract the supplier/vendor company information from this document. Return ONLY the JSON object." },
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
    const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: "AI returned non-JSON response", raw: text }, 502);
    }

    return json({
      company_name:   parsed.company_name   ?? null,
      tax_id:         parsed.tax_id         ?? null,
      address:        parsed.address        ?? null,
      city:           parsed.city           ?? null,
      country:        parsed.country        ?? null,
      phone:          parsed.phone          ?? null,
      email:          parsed.email          ?? null,
      website:        parsed.website        ?? null,
      contact_person: parsed.contact_person ?? null,
      confidence:     parsed.confidence     ?? "medium",
      notes:          parsed.notes          ?? "",
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
