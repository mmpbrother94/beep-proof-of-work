// Serverless proxy to Gemini so the API key never reaches the browser.
import crypto from "node:crypto";

// Proof links are signed here so a recruiter can tell if anyone edited the score.
const sign = proof => crypto
  .createHmac("sha256", process.env.PROOF_SECRET || process.env.GEMINI_API_KEY)
  .update(JSON.stringify(proof)).digest("base64url").slice(0, 22);
// Tried in order; the next one is used if a model is busy (503) or retired (404).
const MODELS = (process.env.GEMINI_MODEL || "gemini-3-flash-preview,gemini-3.1-flash-lite,gemini-flash-latest").split(",");

const SYSTEM = `You are a hiring manager at an Indian company hiring interns/freshers, mostly from Tier 2/3 colleges.
You judge WORK, not English. Students may write in Hinglish; never penalise language, only substance.
Be honest and specific, never generic. Always reply with ONLY valid JSON, no markdown fences.`;

function prompt(body) {
  const { mode, job, task, work } = body;

  if (mode === "task") {
    return `Here is a real internship/job post a student wants to apply to:
"""${job}"""

1. Extract the role and the 3 most important skills the post really needs.
2. Design ONE realistic work task this company's intern would get in week 1, doable in about 20 minutes
   on a phone or laptop with no paid tools. Include ALL material needed inline (e.g. a small messy data table
   as text, a short product brief, a customer complaint, sample code). The answer must be typed as text.
3. Write the hidden grading rubric (4 criteria, each tied to a skill from the post).
JSON: {
 "role": "...", "company_type": "e.g. D2C skincare startup",
 "skills": ["..","..",".."],
 "task_title": "...",
 "task_brief": "what to do, as the manager would say it, 3-5 sentences",
 "material": "the data/brief/code they work on, plain text, can be multi-line",
 "deliverable": "exactly what to submit",
 "rubric": [{"criterion": "...", "skill": "...", "what_good_looks_like": "..."}]
}`;
  }

  return `Job post:
"""${job}"""
Task given: ${JSON.stringify(task)}
Student's submission:
"""${work}"""

Grade it strictly against the rubric, like a real hiring manager deciding whether to shortlist.
JSON: {
 "score": 0-100,
 "decision": "Shortlist" | "Maybe" | "Not yet",
 "manager_note": "2-3 sentences in the manager's voice, direct and kind",
 "rubric_scores": [{"criterion": "...", "score": 0-10, "evidence": "quote or point to what they did/missed"}],
 "best_part": "the single strongest thing in their work",
 "fix_first": ["3 concrete fixes, most important first"],
 "improved_example": "a short model answer for the weakest part so they learn",
 "apply_advice": "one line: apply now with this proof, or redo the task after which fix",
 "proof_line": "one line a recruiter reads: what this student demonstrably did, e.g. 'Cleaned a 40-row sales sheet and found the top-returning SKU'"
}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });

  const body = req.body || {};
  if (body.mode === "verify") {
    return res.status(200).json({ valid: !!body.proof && sign(body.proof) === body.sig });
  }
  if (!body.job || !["task", "grade"].includes(body.mode) || (body.mode === "grade" && !body.work)) {
    return res.status(400).json({ error: "Bad request" });
  }
  body.job = String(body.job).slice(0, 6000);
  body.work = String(body.work || "").slice(0, 8000);
  // Event log for measuring the funnel (visible in Vercel → Logs).
  console.log(JSON.stringify({ event: body.mode, at: new Date().toISOString() }));

  let lastError = "AI error";
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: prompt(body) }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.5 },
          }),
        }
      );
      const data = await r.json();
      if (!r.ok) { lastError = data.error?.message || lastError; continue; }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const out = JSON.parse(text.replace(/^```(json)?|```$/g, ""));
      if (body.mode === "grade") {
        // Build the proof from the server's own grade, so the student can't inflate it.
        const t = body.task || {};
        out.proof = {
          n: String(body.name || "Student").slice(0, 60), r: t.role, c: t.company_type, t: t.task_title,
          b: t.task_brief, s: out.score, d: out.decision, p: out.proof_line, w: body.work.slice(0, 1500),
          rs: (out.rubric_scores || []).map(x => [x.criterion, x.score]), dt: new Date().toISOString().slice(0, 10),
        };
        out.sig = sign(out.proof);
      }
      return res.status(200).json(out);
    } catch (e) {
      lastError = e.message;
    }
  }
  return res.status(502).json({ error: lastError });
}
