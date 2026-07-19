type SendArgs = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendMailtrapEmail(args: SendArgs) {
  const token = (process.env.MAILTRAP_API_TOKEN || "").trim();
  const fromEmail = (process.env.MAIL_FROM_EMAIL || "").trim();
  const fromName = (process.env.MAIL_FROM_NAME || "Agri Ledger").trim();

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
      to: args.to.map((email) => ({ email })),
      subject: args.subject,
      html: args.html,
      text: args.text || stripTags(args.html),
      category: "Ledger Summary",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
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
