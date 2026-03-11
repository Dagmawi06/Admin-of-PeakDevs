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

// fetches messages in chunks so we don't blow up memory if the table grows.
async function accumulateStats(supabase, dateFromIso) {
  const chunkSize = 1000;
  let offset = 0;
  let total = 0;
  let rangeCount = 0;
  const inquiryCounts = {};
  const sourceCounts = {};
  const now = new Date();
  const weekAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  while (true) {
    let query = supabase
      .from("contact_messages")
      // pull everything; we'll only inspect the handful of fields we care about
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + chunkSize - 1);

    if (dateFromIso) query = query.gte("created_at", dateFromIso);

    const { data, error } = await query;
    if (error) throw new Error(error.message || "Failed to fetch stats rows.");
    const rows = Array.isArray(data) ? data : [];
    for (const r of rows) {
      total += 1;
      if (r.created_at && r.created_at >= weekAgoIso) {
        rangeCount += 1;
      }
      if (r.inquiry_type) {
        inquiryCounts[r.inquiry_type] = (inquiryCounts[r.inquiry_type] || 0) + 1;
      }
      if (r.conversion_source) {
        sourceCounts[r.conversion_source] = (sourceCounts[r.conversion_source] || 0) + 1;
      }
    }
    if (rows.length < chunkSize) break;
    offset += rows.length;
  }

  const mostCommonInquiry = Object.entries(inquiryCounts)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0])[0] || null;
  const conversionSource = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0])[0] || null;

  return { total, rangeCount, mostCommonInquiry, conversionSource };
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
    const range = (event.queryStringParameters?.range || "all").trim();
    const dateFromIso = rangeToDate(range);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const stats = await accumulateStats(supabase, dateFromIso);
    return json(200, { ok: true, stats });
  } catch (err) {
    return json(500, { ok: false, error: err.message || "Unexpected server error." });
  }
};
