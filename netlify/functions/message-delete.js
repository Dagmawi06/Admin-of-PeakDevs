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
      "WWW-Authenticate": 'Basic realm="SDS Inbox"',
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

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v || "");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        Allow: "DELETE,OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "DELETE") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  if (!isAuthorized(event)) return unauthorized();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return json(500, { ok: false, error: "Server is missing Supabase environment variables." });
  }

  const id = (event.queryStringParameters?.id || "").trim();
  if (!isUuid(id)) {
    return json(400, { ok: false, error: "Valid id query param is required." });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from("contact_messages").delete().eq("id", id);
    if (error) return json(500, { ok: false, error: error.message || "Delete failed." });

    return json(200, { ok: true });
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Unexpected server error." });
  }
};
