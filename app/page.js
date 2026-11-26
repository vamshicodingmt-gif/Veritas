"use client";
import { useMemo, useState } from "react";
function Score({value}){return <span className="scoreNum">{value}<small>/10</small></span>}

async function readApiResponse(response){
  const raw = await response.text();
  if(!raw.trim()){
    throw new Error("Veritas API returned an empty response (HTTP "+response.status+"). Check the Vercel Function logs and confirm the latest deployment is ready.");
  }
  let payload;
  try { payload = JSON.parse(raw); }
  catch {
    const hint = raw.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,180);
    throw new Error("The server returned a non-JSON response (HTTP "+response.status+"). "+(hint || "The response body could not be read."));
  }
  if(!response.ok) throw new Error(payload?.error || "Verification failed (HTTP "+response.status+").");
  return payload;
}

export default function Home(){
 const[name,setName]=useState(""),[urls,setUrls]=useState(""),[notes,setNotes]=useState(""),[file,setFile]=useState(null),[result,setResult]=useState(null),[status,setStatus]=useState(""),[loading,setLoading]=useState(false);
 const urlCount=useMemo(()=>urls.split(/\s+/).filter(Boolean).length,[urls]);
 async function analyze(){
  if(!name.trim()&&!urls.trim()&&!notes.trim()&&!file){setStatus("Add a candidate name, a URL, notes, or a file first.");return}
  setLoading(true);setResult(null);setStatus("Veritas is collecting available evidence and building the review...");
  try{
   const fd=new FormData();fd.append("name",name);fd.append("urls",urls);fd.append("notes",notes);if(file)fd.append("file",file);
   const response=await fetch("/api/analyze",{method:"POST",body:fd,headers:{"Accept":"application/json"}});
   const data=await readApiResponse(response);
   if(!data?.result) throw new Error("The analysis service returned no report. Please retry; check the Vercel Function logs if this continues.");
   setResult(data.result);setStatus("Completed with "+(data.modelUsed||"Gemini")+". "+(data.sourcesChecked||0)+" supplied URL reference(s) were counted (not necessarily opened).");
  }catch(e){setStatus(e instanceof Error?e.message:"Something went wrong while analyzing this candidate.")}finally{setLoading(false)}
 }
 function clearAll(){setName("");setUrls("");setNotes("");setFile(null);setResult(null);setStatus("")}
 return <div className="shell"><header className="topbar"><div className="brand"><div className="mark">V</div>VERITAS</div><div className="badge">AI-native verification workspace</div></header>
 <main className="main"><section className="hero"><div><div className="kicker">Evidence over assumptions</div><h1>Know who you’re hiring.</h1><p>Veritas turns candidate information, public web evidence and supplied documents into an auditable pre-employment review — without pretending that an AI score is a fact.</p></div><div className="heroCard"><strong>One workspace.</strong><span>Name → LinkedIn → documents → public signals → structured review.</span></div></section>
 <section className="workspace"><div className="panel"><div className="panelHead"><h2>Candidate intake</h2><span className="badge">{urlCount} URL{urlCount===1?"":"s"}</span></div><div className="panelBody">
 <div className="field"><label className="label">Candidate name</label><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Aarav Mehta"/></div>
 <div className="field"><label className="label">Profiles / URLs</label><textarea className="textarea" value={urls} onChange={e=>setUrls(e.target.value)} placeholder="LinkedIn, Indeed, portfolio, company profile, articles — one per line"/></div>
 <div className="field"><label className="label">Additional context</label><textarea className="textarea" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Role, claims to verify, dates, concerns, interview notes..."/></div>
 <div className="field"><label className="label">Import file</label><div className="drop"><label htmlFor="file">{file?<><b>{file.name}</b><div className="fileName">Ready for analysis</div></>:<>Drop or choose a PDF, XLSX, CSV, TXT, MD or JSON file<br/><span className="fileName">Candidate sheets are supported</span></>}</label><input id="file" type="file" accept=".pdf,.xlsx,.xls,.csv,.txt,.md,.json" onChange={e=>setFile(e.target.files?.[0]||null)}/></div></div>
 <div className="actions"><button className="primary" onClick={analyze} disabled={loading}>{loading?"Analyzing…":"Run verification"}</button><button className="secondary" onClick={clearAll} disabled={loading}>Clear</button></div>
 {status&&<div className="status" role="status">{status}</div>}<div className="disclaimer">For employment decisions, treat Veritas as decision support. Public-web signals can be incomplete, stale, wrong or unrelated to the person. Do not use protected characteristics or sensitive personal information as a hiring criterion.</div>
 </div></div>
 <div className="panel result"><div className="panelHead"><h2>Verification review</h2><span className="badge">Live report</span></div>{result?<Report result={result}/>:<div className="empty"><div><div className="emptyIcon">✦</div><b>No verification yet</b><p>Give Veritas a candidate and it will produce a structured review here.</p></div></div>}</div>
 </section></main></div>
}
function Report({result}){return <div className="panelBody"><div className="score"><Score value={result.overallScore??"—"}/><div className="verdict"><b>{result.verdict||"Review complete"}</b><span>{result.confidence||"Confidence not specified"}</span></div></div>
 <div className="grid">{[["Skills",result.skillsScore],["Reliability",result.reliabilityScore],["Professional",result.behaviorScore]].map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value??"—"}/10</strong></div>)}</div>
 <div className="section"><h3>Executive summary</h3><p>{result.summary}</p></div><div className="section"><h3>Evidence & signals</h3>{(result.signals||[]).map((s,i)=><div className="signal" key={i}><div className={"dot "+(s.severity==="concerning"?"bad":s.severity==="mixed"?"warn":"")}></div><div><b>{s.title}</b><p>{s.detail}</p></div></div>)}</div>
 <div className="section"><h3>Claims to verify</h3><ul>{(result.claimsToVerify||[]).map((x,i)=><li key={i}>{x}</li>)}</ul></div><div className="section"><h3>Positive evidence</h3><ul>{(result.positiveEvidence||[]).map((x,i)=><li key={i}>{x}</li>)}</ul></div><div className="section"><h3>Decision notes</h3><p>{result.decisionNotes}</p></div></div>}
