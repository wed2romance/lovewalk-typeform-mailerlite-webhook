import crypto from "crypto";

const ML_API = "https://connect.mailerlite.com/api";

export default async function handler(req, res) {
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const signature = req.headers["typeform-signature"];
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.TYPEFORM_SECRET).update(raw).digest("base64");
    if (signature !== expected) return res.status(401).end("Bad signature");

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const fr = payload?.form_response;
    if (!fr) return res.status(200).end("no-op");

    const answers = fr.answers || [];
    const email = readAnswer(answers, "email");     // replace "email" with your Typeform field ref
    const consent = readAnswer(answers, "consent"); // replace "consent" with your Typeform field ref

    if (!email || !isConsented(consent)) {
      return res.status(200).end("no email or no consent");
    }

    const resp = await fetch(`${ML_API}/subscribers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.MAILERLITE_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        email,
        groups: [process.env.GROUP_PENDING]
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("MailerLite error", resp.status, t);
      return res.status(500).end("MailerLite error");
    }

    return res.status(200).end("ok");
  } catch (e) {
    console.error(e);
    return res.status(500).end("server error");
  }
}

function readAnswer(answers, ref) {
  const a = answers.find(x => x?.field?.ref === ref || x?.field?.id === ref);
  if (!a) return null;
  if (a.type === "email") return a.email;
  if (a.type === "text") return a.text;
  if (a.type === "choice") return a.choice?.label;
  if (a.type === "boolean") return a.boolean === true ? "Yes" : "No";
  if (a.type === "choices") return a.choices?.labels?.join(", ");
  return null;
}

function isConsented(val) {
  if (typeof val === "boolean") return val === true;
  if (typeof val === "string") return val.trim().toLowerCase() === "yes";
  return false;
}
