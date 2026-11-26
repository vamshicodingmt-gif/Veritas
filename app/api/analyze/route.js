import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

const PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MODELS = [...new Set([PRIMARY_MODEL, "gemini-3.8-flash", "gemini-3.5-flash-lite"])];

const schema = {
  type: "object",
  properties: {
    overallScore: { type: "number" },
    skillsScore: { type: "number" },
    reliabilityScore: { type: "number" },
    behaviorScore: { type: "number" },
    verdict: { type: "string" },
    confidence: { type: "string" },
    summary: { type: "string" },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["clear", "mixed", "concerning"] }
        },
        required: ["title", "detail", "severity"]
      }
    },
    claimsToVerify: { type: "array", items: { type: "string" } },
    positiveEvidence: { type: "array", items: { type: "string" } },
    decisionNotes: { type: "string" }
  },
  required: ["overallScore","skillsScore","reliabilityScore","behaviorScore","verdict","confidence","summary","signals","claimsToVerify","positiveEvidence","decisionNotes"]
};

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, Math.round(number * 10) / 10)) : 0;
}

async function extractFile(file) {
  if (!file) return "";
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const output = await parser.getText();
      return output.text.slice(0, 50000);
    } finally {
      await parser.destroy();
    }
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames
      .map(sheet => "SHEET: " + sheet + "\n" + XLSX.utils.sheet_to_csv(workbook.Sheets[sheet]))
      .join("\n\n")
      .slice(0, 50000);
  }

  return buffer.toString("utf8").slice(0, 50000);
}

function buildPrompt({ name, urls, notes, fileText }) {
  return `You are Veritas, an evidence-led B2B pre-employment verification analyst.

Candidate name: ${name || "Not provided"}
URLs: ${urls || "None"}
Additional context: ${notes || "None"}
Imported document: ${fileText || "None"}

Analyze only supplied information plus information retrieved with enabled public-web tools. Cross-check identity carefully. Distinguish VERIFIED, CORROBORATED, UNVERIFIED, CONFLICTING and UNKNOWN. Never invent employment history, education, misconduct, criminal history, medical information, family status, protected characteristics, or reasons for leaving a job.

Use web search for public-footprint checks and URL context for supplied URLs when accessible. Do not infer that a search result belongs to the candidate solely because names match. Do not treat lack of online evidence as evidence of wrongdoing.

Score skills, reliability and professional behavior only from job-relevant evidence. Avoid protected or highly sensitive attributes. If evidence is weak, lower confidence rather than making a strong claim.

Return the structured review. The score is decision-support only, not a hiring decision or factual statement about character.`;
}

async function readProviderJson(response, model) {
  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error("Gemini model " + model + " returned an empty HTTP " + response.status + " response.");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error("Gemini model " + model + " returned a non-JSON HTTP " + response.status + " response: " + raw.slice(0, 240));
  }

  if (!response.ok) {
    const providerMessage = payload?.error?.message || payload?.message || "Unknown Gemini API error";
    throw new Error("Gemini " + model + " (HTTP " + response.status + "): " + providerMessage);
  }
  return payload;
}

async function callGemini(prompt, model) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }, { url_context: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      temperature: 0.2,
      maxOutputTokens: 5000
    }
  };

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify(body),
      cache: "no-store"
    }
  );

  const payload = await readProviderJson(response, model);
  const responseText = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("") || "";
  if (!responseText.trim()) {
    const reason = payload?.candidates?.[0]?.finishReason || "No candidate text returned";
    throw new Error("Gemini model " + model + " produced no JSON report (" + reason + ").");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error("Gemini model " + model + " returned malformed report JSON: " + responseText.slice(0, 240));
  }
}

export async function POST(request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured in this deployment." }, { status: 500 });
    }

    const form = await request.formData();
    const name = String(form.get("name") || "");
    const urls = String(form.get("urls") || "");
    const notes = String(form.get("notes") || "");
    const file = form.get("file");
    const fileText = file && typeof file.arrayBuffer === "function" ? await extractFile(file) : "";

    if (!name && !urls && !notes && !fileText) {
      return NextResponse.json({ error: "No candidate information was supplied." }, { status: 400 });
    }

    const prompt = buildPrompt({ name, urls, notes, fileText });
    const failures = [];

    for (const model of MODELS) {
      try {
        const result = await callGemini(prompt, model);
        for (const key of ["overallScore", "skillsScore", "reliabilityScore", "behaviorScore"]) {
          result[key] = clamp(result[key]);
        }
        return NextResponse.json({
          result,
          modelUsed: model,
          sourcesChecked: urls.split(/\s+/).filter(Boolean).length
        });
      } catch (error) {
        failures.push(model + ": " + (error instanceof Error ? error.message : String(error)));
      }
    }

    console.error("All Veritas Gemini models failed:", failures);
    return NextResponse.json({
      error: "All Gemini model attempts failed. " + failures.join(" | ")
    }, { status: 502 });
  } catch (error) {
    console.error("Veritas analysis error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to complete verification."
    }, { status: 500 });
  }
}
