import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { to, subject, body, template_vars } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch email config from system_settings
    const { data: config } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "email_config")
      .maybeSingle();

    if (!config?.value?.email_enabled) {
      return new Response(
        JSON.stringify({ error: "Email sending is disabled", code: "EMAIL_DISABLED" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailConfig = config.value;

    if (!emailConfig.smtp_host || !emailConfig.smtp_user) {
      return new Response(
        JSON.stringify({ error: "SMTP not configured", code: "SMTP_NOT_CONFIGURED" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace template variables in subject and body
    let finalSubject = subject;
    let finalBody = body;
    if (template_vars && typeof template_vars === "object") {
      for (const [key, value] of Object.entries(template_vars)) {
        const placeholder = `{{${key}}}`;
        finalSubject = finalSubject.replaceAll(placeholder, String(value));
        finalBody = finalBody.replaceAll(placeholder, String(value));
      }
    }

    // Create SMTP transport
    const transport = nodemailer.createTransport({
      host: emailConfig.smtp_host,
      port: parseInt(emailConfig.smtp_port || "587"),
      secure: parseInt(emailConfig.smtp_port || "587") === 465,
      auth: {
        user: emailConfig.smtp_user,
        pass: emailConfig.smtp_password,
      },
    });

    // Send email
    const info = await transport.sendMail({
      from: `"${emailConfig.sender_name || "Smart Procurement"}" <${emailConfig.sender_email || emailConfig.smtp_user}>`,
      to,
      subject: finalSubject,
      text: finalBody,
      html: finalBody.replace(/\n/g, "<br>"),
    });

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send email error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
