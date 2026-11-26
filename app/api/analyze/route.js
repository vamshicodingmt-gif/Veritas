import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";
export const runtime="nodejs"; export const maxDuration=60;
const MODELS=[process.env.GEMINI_MODEL||"gemini-3.8-flash","gemini-3.6-flash","gemini-3.1-flash-lite"];
const schema={type:"object",properties:{
 overallScore:{type:"number"},skillsScore:{type:"number"},reliabilityScore:{type:"number"},behaviorScore:{type:"number"},
 verdict:{type:"string"},confidence:{type:"string"},summary:{type:"string"},
 signals:{type:"array",items:{type:"object",properties:{title:{type:"string"},detail:{type:"string"},severity:{type:"string",enum:["clear","mixed","concerning"]}},required:["title","detail","severity"]}},
 claimsToVerify:{type:"array",items:{type:"string"}},positiveEvidence:{type:"array",items:{type:"string"}},decisionNotes:{type:"string"}
},required:["overallScore","skillsScore","reliabilityScore","behaviorScore","verdict","confidence","summary","signals","claimsToVerify","positiveEvidence","decisionNotes"]};
function clamp(x){const n=Number(x);return Number.isFinite(n)?Math.max(0,Math.min(10,Math.round(n*10)/10)):0}
async function extractFile(file){
 if(!file)return "";const name=file.name.toLowerCase(),buffer=Buffer.from(await file.arrayBuffer());
 if(name.endsWith(".pdf")){const parser=new PDFParse({data:buffer});try{const out=await parser.getText();return out.text.slice(0,50000)}finally{await parser.destroy()}}
 if(name.endsWith(".xlsx")||name.endsWith(".xls")){const wb=XLSX.read(buffer,{type:"buffer"});return wb.SheetNames.map(s=>"SHEET: "+s+"\n"+XLSX.utils.sheet_to_csv(wb.Sheets[s])).join("\n\n").slice(0,50000)}
 return buffer.toString("utf8").slice(0,50000);
}
function buildPrompt({name,urls,notes,fileText}){return "You are Veritas, an evidence-led B2B pre-employment verification analyst.\n\nCandidate name: "+(name||"Not provided")+"\nURLs: "+(urls||"None")+"\nAdditional context: "+(notes||"None")+"\nImported document: "+(fileText||"None")+"\n\nAnalyze only supplied information plus information retrieved with enabled public-web tools. Cross-check identity carefully. Distinguish VERIFIED, CORROBORATED, UNVERIFIED, CONFLICTING and UNKNOWN. Never invent employment history, education, misconduct, criminal history, medical information, family status, protected characteristics, or reasons for leaving a job. Use web search for public footprint checks and URL context for supplied URLs when accessible. Do not infer that a search result belongs to the candidate solely because names match. Do not treat lack of online evidence as evidence of wrongdoing. Score skills, reliability and professional behavior only from job-relevant evidence. Avoid protected or highly sensitive attributes. If evidence is weak, lower confidence rather than making a strong claim. Return the structured review. The score is decision-support only, not a hiring decision or factual statement about character."}
async function callGemini(prompt,model){
 const body={contents:[{role:"user",parts:[{text:prompt}]}],tools:[{google_search:{}},{url_context:{}}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema,temperature:.2,maxOutputTokens:5000}};
 const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent?key="+encodeURIComponent(process.env.GEMINI_API_KEY),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
 const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||"Gemini request failed ("+r.status+")");
 const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";if(!text)throw new Error("Gemini returned an empty response.");return JSON.parse(text);
}
export async function POST(request){
 try{if(!process.env.GEMINI_API_KEY)return NextResponse.json({error:"GEMINI_API_KEY is not configured."},{status:500});
  const form=await request.formData(),name=String(form.get("name")||""),urls=String(form.get("urls")||""),notes=String(form.get("notes")||""),file=form.get("file"),fileText=file&&typeof file.arrayBuffer==="function"?await extractFile(file):"";
  if(!name&&!urls&&!notes&&!fileText)return NextResponse.json({error:"No candidate information was supplied."},{status:400});
  const prompt=buildPrompt({name,urls,notes,fileText});let lastError;
  for(const model of MODELS){try{const result=await callGemini(prompt,model);for(const key of ["overallScore","skillsScore","reliabilityScore","behaviorScore"])result[key]=clamp(result[key]);return NextResponse.json({result,modelUsed:model,sourcesChecked:urls.split(/\s+/).filter(Boolean).length})}catch(e){lastError=e}}
  return NextResponse.json({error:lastError?.message||"All configured Gemini models failed."},{status:502});
 }catch(e){console.error("Veritas analysis error:",e);return NextResponse.json({error:"Unable to complete verification. Check server logs for details."},{status:500})}
}
