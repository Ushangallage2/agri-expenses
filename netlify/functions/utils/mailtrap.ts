type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
};

function cleanEnv(value: string) {
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function cleanEmail(value: string) {
  return cleanEnv(value).replace(/^<|>$/g, "").trim();
}

export async function sendMailtrapEmail(args: SendArgs) {
  const token = cleanEnv(process.env.MAILTRAP_API_TOKEN || "");
  const fromEmail = cleanEmail(process.env.MAIL_FROM_EMAIL || "");
  const fromName = cleanEnv(process.env.MAIL_FROM_NAME || "") || "Agri Ledger";

  if (!token) throw new Error("MAILTRAP_API_TOKEN is not set");
  if (!fromEmail) throw new Error("MAIL_FROM_EMAIL is not set");
  if (!args.to.length) throw new Error("No recipients");

  const res = await fetch("https://send.api.mailtrap.io/api/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: fromEmail, name: fromName },
      to: args.to.map((email) => ({ email: cleanEmail(email) })),
      subject: args.subject,
      html: args.html,
      text: args.text || stripTags(args.html),
      category: "Ledger Summary",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    const invalidFrom = /from['"]?\s*address is invalid/i.test(body);
    if (invalidFrom) {
      throw new Error(
        "Mailtrap rejected MAIL_FROM_EMAIL. Use an address on a domain you verified under Mailtrap → Sending → Domains (not Gmail). Then trigger a new Netlify deploy."
      );
    }
    throw new Error(`Mailtrap ${res.status}: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : { success: true };
}

function stripTags(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}
