const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="NIP Inbox"',
    },
    body: JSON.stringify({ ok: false, error: "Unauthorized" }),
  };
}

function isAuthorized(event) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) return false;

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const encoded = authHeader.slice(6).trim();
  let decoded = "";
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch (_e) {
    return false;
  }

  const splitIndex = decoded.indexOf(":");
  if (splitIndex === -1) return false;
  const suppliedUser = decoded.slice(0, splitIndex);
  const suppliedPass = decoded.slice(splitIndex + 1);
  return suppliedUser === user && suppliedPass === pass;
}

function rangeToDate(range) {
  if (range === "all") return null;
  const now = Date.now();
  const map = {
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };
  const ms = map[range] || map["7d"];
  return new Date(now - ms).toISOString();
}

function escapeCsv(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function fetchAllMessages(supabase, q, dateFromIso) {
  const chunkSize = 1000;
  const all = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from("contact_messages")
      .select("id, created_at, name, email, message, user_agent, page_url, ip")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunkSize - 1);

    if (dateFromIso) query = query.gte("created_at", dateFromIso);
    if (q) {
      const escaped = q.replace(/[%]/g, "\\%");
      query = query.or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%,message.ilike.%${escaped}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message || "Failed to fetch export rows.");
    const rows = Array.isArray(data) ? data : [];
    all.push(...rows);
    if (rows.length < chunkSize) break;
    offset += rows.length;
  }

  return all;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        Allow: "GET,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  if (!isAuthorized(event)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return json(500, { ok: false, error: "Server is missing Supabase environment variables." });
  }

  try {
    const q = (event.queryStringParameters?.q || "").trim();
    const range = (event.queryStringParameters?.range || "7d").trim();
    const dateFromIso = rangeToDate(range);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rows = await fetchAllMessages(supabase, q, dateFromIso);
    const header = ["id", "created_at", "name", "email", "message", "user_agent", "page_url", "ip"];
    const lines = [header.join(",")];
    for (const row of rows) {
      lines.push(
        [
          escapeCsv(row.id),
          escapeCsv(row.created_at),
          escapeCsv(row.name),
          escapeCsv(row.email),
          escapeCsv(row.message),
          escapeCsv(row.user_agent),
          escapeCsv(row.page_url),
          escapeCsv(row.ip),
        ].join(",")
      );
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nip-contact-messages.csv"',
        "Cache-Control": "no-store",
      },
      body: lines.join("\n"),
    };
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Unexpected server error." });
  }
};
