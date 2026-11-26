# Veritas

AI-native background verification workspace for modern HR teams.

Veritas is a proof-of-concept for an evidence-led candidate verification service. It accepts a candidate name, public profile URLs, notes, and common HR files, then uses Gemini with public-web search and URL context to produce a structured review.

## Included

- Candidate name input
- LinkedIn, Indeed, portfolio and arbitrary public URL input
- PDF extraction
- XLS/XLSX spreadsheet extraction
- CSV, TXT, Markdown and JSON ingestion
- Gemini web search + URL context
- Structured verification report
- Overall, skills, reliability and professional-behavior scores
- Evidence signals, claims to verify, positive evidence and decision notes
- Server-side Gemini API key handling
- Vercel-ready Next.js App Router architecture
- Model fallback chain: gemini-3.8-flash -> gemini-3.6-flash -> gemini-3.1-flash-lite

## Product boundary

This is decision support, not an automated hiring decision. The model must not infer protected characteristics, medical/family information, criminality, or other sensitive traits. Public-web matches can be wrong, stale, or unrelated to the candidate. Material claims should be verified by a human before employment action.

The AI calling / Twilio workflow is intentionally not included in this first build.

## Local setup

1. Install Node.js 20.16+.
2. Run npm install.
3. Copy .env.example to .env.local.
4. Add your Gemini API key to .env.local:

GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash

5. Run npm run dev and open http://localhost:3000.

## Vercel

Add GEMINI_API_KEY as an encrypted/sensitive environment variable and GEMINI_MODEL as gemini-3.8-flash. Never commit the API key or put it in a NEXT_PUBLIC_* variable.

## Gemini model choice

The default is gemini-3.8-flash. The implementation calls the Gemini REST API directly rather than pinning a JavaScript SDK version, reducing SDK drift risk. It also has server-side fallbacks if the configured model is unavailable.

## Architecture

Browser -> Next.js UI -> POST /api/analyze -> PDF/XLSX/text extraction -> Gemini REST API -> Google Search + URL Context -> structured verification JSON.

## Future service layer

HRIS/ATS integrations, candidate consent workflows, audit logs, human review queues, Twilio reference calls, transcripts, role-specific policies, evidence provenance, SSO/SCIM/RBAC, retention controls and deletion workflows can be added as the service matures.

## License

Private/proprietary proof of concept unless the owner changes this license.
