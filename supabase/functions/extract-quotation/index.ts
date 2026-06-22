// Extract quotation/pricing data from a quotation document (PDF or image) using Google Gemini.
// Body: { file_base64: string, mime_type: string, rfq_items: { item_name: string, quantity: number, unit: string }[] }
// Returns: { items: [{item_name, unit_price}], currency, lead_time_days, discount, vat, payment_term, delivery_terms, warranty, validity_days, spec_compliance_score, remark, confidence }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You read quotation documents, price proposals, invoices, or commercial offers from suppliers.

You will receive the document AND a list of RFQ line items. Your job is to extract pricing and commercial terms from the quotation document and match them to the RFQ items.

Output ONLY valid JSON with this structure:

{
  "supplier_name": "<company name of the SELLER/VENDOR who is offering the price>" (string or null),
  "supplier_tax_id": "<tax ID / VAT number / เลขประจำตัวผู้เสียภาษี of the seller>" (string or null),
  "items": [
    {
      "item_name": "<name of the item as written in the quotation>",
      "rfq_item_index": <0-based index matching the RFQ items list, or null if no match>,
      "unit_price": <number or null>,
      "quantity": <number or null>,
      "unit": "<unit as written>"
    }
  ],
  "currency": "<THB|USD|EUR or other, default THB for Thai documents>",
  "lead_time_days": <number or null>,
  "discount": <total discount amount as number, or 0>,
  "vat": <VAT amount as number, or 0>,
  "payment_term": "<e.g. Net 30, COD, etc.>" (string or null),
  "delivery_terms": "<e.g. FOB, CIF, Ex-Works, etc.>" (string or null),
  "warranty": "<warranty text>" (string or null),
  "validity_days": <number or null, how many days the quotation is valid>,
  "quotation_no": "<quotation/reference number>" (string or null),
  "quotation_date": "<date in YYYY-MM-DD format>" (string or null),
  "remark": "<any additional notes from the quotation>" (string or null),
  "confidence": "high|medium|low"
}

Rules:
- Match quotation items to RFQ items by name similarity. Set rfq_item_index to the closest matching RFQ item.
- unit_price should be the price PER UNIT, not the total line price. If the document shows total price and quantity, divide to get unit price.
- For Thai documents: look for "ราคาต่อหน่วย", "ราคา/หน่วย", "Unit Price", price columns.
- Discount: look for "ส่วนลด", "Discount". Return the AMOUNT, not percentage.
- VAT: look for "ภาษีมูลค่าเพิ่ม", "VAT 7%". Return the AMOUNT.
- Payment terms: look for "เงื่อนไขการชำระ", "Payment Terms", "Credit Term".
- If a field is not found in the document, return null (not empty string).
- Include ALL line items found in the quotation, even if they don't match RFQ items.
- supplier_name: Extract the SELLER/VENDOR company name (the one offering the price), NOT the buyer/customer. For Thai documents look for "ผู้ขาย", "บริษัท" at the top or letterhead.
- supplier_tax_id: Look for "เลขประจำตัวผู้เสียภาษี", "Tax ID", "VAT No.", or a 13-digit number near the seller info.`;

const MODEL = "gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json("ok", 200);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "GEMINI_API_KEY not configured" }, 500);
    }

    const { file_base64, mime_type, rfq_items } = await req.json();
    if (!file_base64 || !mime_type) {
      return json({ error: "missing file_base64 or mime_type" }, 400);
    }

    const isPdf = mime_type === "application/pdf";
    const isImage = mime_type.startsWith("image/");
    if (!isPdf && !isImage) {
      return json({ error: `unsupported mime_type: ${mime_type}` }, 400);
    }

    const itemsList = (rfq_items || []).map((it: any, idx: number) =>
      `${idx}. ${it.item_name} (${it.quantity ?? '?'} ${it.unit ?? ''})`
    ).join("\n");

    const userPrompt = `Extract quotation/pricing data from this document.

RFQ Line Items to match against:
${itemsList || "(no items provided)"}

Return the JSON object with extracted data.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

    const reqBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: mime_type, data: file_base64 } },
          { text: userPrompt },
        ],
      }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
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
      supplier_name:         parsed.supplier_name ?? null,
      supplier_tax_id:       parsed.supplier_tax_id ?? null,
      items:                 Array.isArray(parsed.items) ? parsed.items : [],
      currency:              parsed.currency ?? "THB",
      lead_time_days:        parsed.lead_time_days ?? null,
      discount:              parsed.discount ?? 0,
      vat:                   parsed.vat ?? 0,
      payment_term:          parsed.payment_term ?? null,
      delivery_terms:        parsed.delivery_terms ?? null,
      warranty:              parsed.warranty ?? null,
      validity_days:         parsed.validity_days ?? null,
      quotation_no:          parsed.quotation_no ?? null,
      quotation_date:        parsed.quotation_date ?? null,
      remark:                parsed.remark ?? null,
      confidence:            parsed.confidence ?? "medium",
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
