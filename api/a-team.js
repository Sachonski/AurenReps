
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const SQL = `SELECT u.id AS user_id, u.first_name, u.last_name,
    wq.current_activity,
    EXTRACT(EPOCH FROM (NOW() - wq.current_activity_updated_at))::int AS seconds_in_state,
    wp.name AS worker_profile_name, wp.work_type
  FROM workers_queue wq
  JOIN users u ON wq.user_id = u.id
  JOIN worker_profiles wp ON wq.worker_profile_id = wp.id
  WHERE wq.is_active_profile = true
    AND wq.user_id IN (SELECT user_id FROM team_members WHERE team_id = 74)
  ORDER BY wq.current_activity_updated_at ASC`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "mcp-client-2025-04-04",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        mcp_servers: [{ type: "url", url: "https://mcp.onyxplatform.com", name: "onyx" }],
        messages: [{ role: "user", content: `Use sql_execute_query and reply with ONLY a raw JSON array of row objects, no markdown:\n${SQL}` }]
      })
    });

    const data = await r.json();
    if (data.type === "error") throw new Error(data.error?.message);

    let rows = [];
    const tool = (data.content || []).find(b => b.type === "mcp_tool_result");
    if (tool) {
      const p = JSON.parse(tool?.content?.[0]?.text || "[]");
      rows = p?.rows ?? p;
    } else {
      const t = (data.content || []).find(b => b.type === "text");
      if (t) { const p = JSON.parse(t.text.replace(/```json|```/g,"").trim()); rows = p?.rows ?? p; }
    }

    res.status(200).json({ rows });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
