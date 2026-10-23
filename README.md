# Beep Proof of Work

Built by Manohar Kumar Sah for the Beep Founder's Office task.

Live: https://beep-proof-of-work.vercel.app · Doc: https://beep-proof-of-work.vercel.app/doc.html

A student pastes a real internship post. Gemini turns it into the actual week-1 task for that role, grades the submission like a hiring manager (Hinglish is fine), and gives a signed proof-of-work link that recruiters can verify.

- `index.html`: the whole front end (student flow + recruiter proof view)
- `api/ai.js`: Vercel serverless function that calls Gemini, builds and signs proofs
- `dev-server.js`: run locally with `GEMINI_API_KEY=... node dev-server.js`
- `proof/`: Play Store review screenshots used as evidence
