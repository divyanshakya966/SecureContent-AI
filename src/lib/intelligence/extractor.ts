// Heuristic extraction of entities, IOCs, TTPs, risks, and key findings.

import type {
  Classification,
  ExtractedEntity,
  IOC,
  TTP,
  IntelRisk,
  KeyFinding,
  IntelligenceReport,
  Severity,
  TacticType,
} from "@/types";
import type { RawFinding } from "@/lib/security/detectors";


const ENTITY_PATTERNS: { type: ExtractedEntity["type"]; re: RegExp; confidence: number }[] = [
  { type: "EMAIL", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, confidence: 0.97 },
  { type: "PHONE", re: /(?:\+91[-.\s]?)?[6-9]\d{4}[-.\s]?\d{5}/g, confidence: 0.85 },
  { type: "PHONE", re: /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, confidence: 0.82 },
  { type: "PHONE", re: /\+44[-.\s]?\d{4}[-.\s]?\d{3}[-.\s]?\d{3}/g, confidence: 0.82 },
  { type: "IP", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, confidence: 0.9 },
  { type: "IP", re: /(?:\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b|\b::1\b)/g, confidence: 0.85 },
  { type: "URL", re: /\bhttps?:\/\/[^\s"']+/gi, confidence: 0.92 },
  { type: "DATE", re: /\b(?:\d{1,2}[-/\s](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-/\s]\d{4}|\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2})\b/gi, confidence: 0.82 },
  { type: "ID", re: /\b(?:EMP|EMP-|ID-|EID-|STAFF-|CVE-\d{4}-\d{4,7})\S*/gi, confidence: 0.78 },
  { type: "ID", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, confidence: 0.85 },
  { type: "ID", re: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, confidence: 0.88 },
  { type: "ID", re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, confidence: 0.85 },
];

const PERSON_ORG_RE = /(?:Project Lead|Engineer|Lead|Manager|Analyst|Officer|Member|Director|Architect|Team|Contact|Author|Owner|Reporter|Supervisor|Coordinator|Administrator|Customer|Client|Candidate|Recruiter|Prepared by|Reported by|Full Name|Name|POC)\s*[:\-]?\s*([A-Z][a-z]+(?:['-][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:['-][A-Za-z]+)?){1,2})/g;
const ORG_RE = /\b(?:Team|Project|Department|Division)\s+[A-Z][a-zA-Z0-9]+\b/g;
const LOCATION_RE = /\b(?:Mumbai|Delhi|Bengaluru|Chennai|Kolkata|Hyderabad|Pune|internal|intranet|dashboard|datacenter)\b/gi;

function extractEntities(text: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  for (const { type, re, confidence } of ENTITY_PATTERNS) {
    const local = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      const value = m[0].trim();
      const key = `${type}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entities.push({
        type,
        value,
        location: `char_offset:${m.index}-${m.index + value.length}`,
        confidence,
        context: text.slice(Math.max(0, m.index - 20), m.index + value.length + 20).replace(/\s+/g, " ").trim(),
      });
    }
  }


  for (const m of text.matchAll(PERSON_ORG_RE)) {
    const val = m[1];
    if (!val) continue;
    const key = `PERSON:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index ?? 0;
    entities.push({ type: "PERSON", value: val, location: `char_offset:${idx}-${idx + val.length}`, confidence: 0.65, context: m[0].slice(0, 80) });
  }
  for (const m of text.matchAll(ORG_RE)) {
    const val = m[0];
    const key = `ORG:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ type: "ORG", value: val, location: `char_offset:${m.index}-${(m.index ?? 0) + val.length}`, confidence: 0.6 });
  }
  for (const m of text.matchAll(LOCATION_RE)) {
    const val = m[0];
    const key = `LOCATION:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push({ type: "LOCATION", value: val, location: `char_offset:${m.index}-${(m.index ?? 0) + val.length}`, confidence: 0.55 });
  }

  return entities.slice(0, 25);
}


const IOC_PATTERNS: { type: IOC["type"]; re: RegExp; severity: Severity; confidence: number }[] = [
  { type: "IP", re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, severity: "MEDIUM", confidence: 0.88 },
  { type: "DOMAIN", re: /\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|gov|edu|internal|intranet|local)\b/gi, severity: "MEDIUM", confidence: 0.75 },
  { type: "URL", re: /\bhttps?:\/\/[^\s"'<>]+/gi, severity: "MEDIUM", confidence: 0.9 },
  { type: "HASH_MD5", re: /\b[a-fA-F0-9]{32}\b/g, severity: "HIGH", confidence: 0.8 },
  { type: "HASH_SHA1", re: /\b[a-fA-F0-9]{40}\b/g, severity: "HIGH", confidence: 0.85 },
  { type: "HASH_SHA256", re: /\b[a-fA-F0-9]{64}\b/g, severity: "HIGH", confidence: 0.88 },
  { type: "CVE", re: /\bCVE-\d{4}-\d{4,7}\b/gi, severity: "HIGH", confidence: 0.95 },
];

function extractIOCs(text: string): IOC[] {
  const iocs: IOC[] = [];
  const seen = new Set<string>();
  for (const { type, re, severity, confidence } of IOC_PATTERNS) {
    const local = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      const val = m[0];
      const key = `${type}:${val}`;
      if (seen.has(key)) continue;
      // Skip email domains (already PII).
      if (type === "DOMAIN" && text.slice(Math.max(0, (m.index ?? 0) - 30), m.index).includes("@")) continue;
      seen.add(key);
      iocs.push({
        type,
        value: val,
        location: `char_offset:${m.index}-${(m.index ?? 0) + val.length}`,
        severity,
        confidence,
        context: text.slice(Math.max(0, (m.index ?? 0) - 15), (m.index ?? 0) + val.length + 15).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return iocs.slice(0, 20);
}


interface TTPDef { keywords: string[]; tactic: TacticType; technique: string; mitreId: string; severity: Severity }

const TTP_DEFS: TTPDef[] = [
  { keywords: ["phishing", "spear phishing", "spearphishing"], tactic: "Initial Access", technique: "Phishing", mitreId: "T1566", severity: "HIGH" },
  { keywords: ["credential dumping", "mimikatz", "lsass dumping"], tactic: "Credential Access", technique: "OS Credential Dumping", mitreId: "T1003", severity: "CRITICAL" },
  { keywords: ["brute force", "password spraying", "credential stuffing"], tactic: "Credential Access", technique: "Brute Force", mitreId: "T1110", severity: "HIGH" },
  { keywords: ["lateral movement", "psexec", "wmi execution"], tactic: "Lateral Movement", technique: "Lateral Tool Transfer", mitreId: "T1021", severity: "HIGH" },
  { keywords: ["command and control", " c2 ", "beacon", "c2 channel"], tactic: "Command and Control", technique: "Application Layer Protocol", mitreId: "T1071", severity: "HIGH" },
  { keywords: ["exfiltration", "data exfiltration", "exfiltrate"], tactic: "Exfiltration", technique: "Exfiltration Over Web Service", mitreId: "T1567", severity: "HIGH" },
  { keywords: ["persistence", "scheduled task", "registry run key", "startup folder"], tactic: "Persistence", technique: "Boot or Logon Autostart Execution", mitreId: "T1547", severity: "MEDIUM" },
  { keywords: ["privilege escalation", "privileged mode", "operator mode", "privileged operator"], tactic: "Privilege Escalation", technique: "Valid Accounts", mitreId: "T1078", severity: "HIGH" },
  { keywords: ["defense evasion", "obfuscation", "hidden instruction", "bypass"], tactic: "Defense Evasion", technique: "Obfuscated Files or Information", mitreId: "T1027", severity: "MEDIUM" },
  { keywords: ["discovery", "reconnaissance", "port scan", "network scan", "vulnerability scanning"], tactic: "Discovery", technique: "Network Service Discovery", mitreId: "T1046", severity: "MEDIUM" },
  { keywords: ["execution", "powershell", "cmd execution", "shell"], tactic: "Execution", technique: "Command and Scripting Interpreter", mitreId: "T1059", severity: "MEDIUM" },
  { keywords: ["collection", "data collection", "keylogging"], tactic: "Collection", technique: "Data from Local System", mitreId: "T1005", severity: "MEDIUM" },
  { keywords: ["impact", "ransomware", "data destruction", "denial of service"], tactic: "Impact", technique: "Data Destruction", mitreId: "T1485", severity: "CRITICAL" },
  { keywords: ["injection", "prompt injection", "ignore previous instructions", "system override"], tactic: "Defense Evasion", technique: "Indirect Command Execution", mitreId: "T1202", severity: "HIGH" },
];

function extractTTPs(text: string): TTP[] {
  const lower = text.toLowerCase();
  const ttps: TTP[] = [];
  const seen = new Set<string>();
  for (const def of TTP_DEFS) {
    for (const kw of def.keywords) {
      const idx = lower.indexOf(kw.toLowerCase());
      if (idx === -1) continue;
      const key = def.mitreId;
      if (seen.has(key)) break;
      seen.add(key);
      const snippet = text.slice(Math.max(0, idx - 30), idx + kw.length + 30).replace(/\s+/g, " ").trim();
      ttps.push({
        technique: def.technique,
        tactic: def.tactic,
        mitreId: def.mitreId,
        confidence: kw.length > 10 ? 0.85 : 0.7,
        evidence: `"${kw}" → ${snippet}`,
        location: `char_offset:${idx}-${idx + kw.length}`,
      });
      break;
    }
  }
  return ttps.slice(0, 12);
}


function synthesizeRisks(text: string, findings: RawFinding[], entities: ExtractedEntity[], iocs: IOC[], ttps: TTP[]): IntelRisk[] {
  const risks: IntelRisk[] = [];
  const catCount = (cat: string) => findings.filter((f) => f.category === cat).length;

  if (catCount("PII") > 5) {
    risks.push({ category: "Data Exposure", severity: "HIGH", description: `Heavy PII exposure (${catCount("PII")} findings) — risk of identity correlation and regulatory breach.`, score: 35 });
  } else if (catCount("PII") > 0) {
    risks.push({ category: "PII Handling", severity: "MEDIUM", description: `${catCount("PII")} PII findings require masking/redaction before external release.`, score: 15 });
  }

  if (catCount("SECRET") > 0) {
    risks.push({ category: "Credential Exposure", severity: "CRITICAL", description: `${catCount("SECRET")} secret/credential findings — immediate rotation and audit required.`, score: 45 });
  }

  if (catCount("PROMPT_INJECTION") > 0) {
    risks.push({ category: "Prompt Injection", severity: "CRITICAL", description: `${catCount("PROMPT_INJECTION")} instruction-like spans quarantined — treat as untrusted data.`, score: 40 });
  }

  if (iocs.length > 0) {
    const highIocs = iocs.filter((i) => i.severity === "HIGH").length;
    risks.push({ category: "Infrastructure Exposure", severity: highIocs ? "HIGH" : "MEDIUM", description: `${iocs.length} IOC(s) extracted (IPs, domains, hashes, CVEs) — validate scope and containment.`, score: 20 + highIocs * 5 });
  }

  if (ttps.length > 0) {
    const crit = ttps.filter((t) => TTP_DEFS.find((d) => d.mitreId === t.mitreId)?.severity === "CRITICAL").length;
    risks.push({ category: "Adversarial Behavior", severity: crit ? "CRITICAL" : "HIGH", description: `${ttps.length} ATT&CK technique(s) observed: ${ttps.map((t) => t.mitreId).join(", ")}`, score: 25 + ttps.length * 3 });
  }

  if (text.toLowerCase().includes("root cause") || text.toLowerCase().includes("postmortem")) {
    risks.push({ category: "Operational Learning", severity: "LOW", description: "Postmortem/timeline content present — ensure follow-ups tracked and not leaked to public audiences.", score: 5 });
  }


  return risks.slice(0, 6);
}


function extractKeyFindings(text: string): KeyFinding[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const scored = sentences.map((s, idx) => {
    let score = 0;
    const lower = s.toLowerCase();
    if (/(root cause|timeline|impact|risk|finding|recommendation|follow-up|exposure|credential|incident|vulnerability)/.test(lower)) score += 3;
    if (/(critical|high|urgent|immediate|rotate|quarantine|blocked)/.test(lower)) score += 2;
    if (s.length > 60 && s.length < 220) score += 1;
    if (idx === 0) score += 0.5;
    const offset = text.indexOf(s);
    return { s, score, offset };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((x) => x.score >= 2).slice(0, 5);
  if (top.length === 0 && scored.length > 0) top.push(scored[0]);
  return top.map((x) => ({
    finding: x.s.slice(0, 240),
    evidence: `sentence @ offset ${x.offset}: "${x.s.slice(0, 80)}..."`,
    location: `char_offset:${x.offset}-${x.offset + x.s.length}`,
    confidence: Math.min(0.95, 0.6 + x.score * 0.08),
    grounded: true,
  }));
}


export interface IntelligenceInput {
  documentId: string;
  rawContent: string;
  findings: RawFinding[];
  classification: Classification;
  riskScore: number;
}

export function buildIntelligenceReport(input: IntelligenceInput): Omit<IntelligenceReport, "id" | "createdAt"> {
  const { documentId, rawContent, findings, classification, riskScore } = input;
  const entities = extractEntities(rawContent);
  const iocs = extractIOCs(rawContent);
  const ttps = extractTTPs(rawContent);
  const risks = synthesizeRisks(rawContent, findings, entities, iocs, ttps);
  const keyFindings = extractKeyFindings(rawContent);

  const evidence = keyFindings.map((kf) => ({
    claim: kf.finding,
    source: kf.evidence,
    location: kf.location,
  }));

  const summary =
    `Analyzed ${rawContent.split(/\s+/).length} words across ${Math.max(1, Math.ceil(rawContent.split(/\n/).length / 40))} pages. ` +
    `Detected ${entities.length} entities, ${iocs.length} IOCs, ${ttps.length} TTP(s). ` +
    (ttps.length ? `ATT&CK: ${ttps.map((t) => `${t.mitreId} (${t.technique})`).join(", ")}. ` : "") +
    (risks.length ? `Top risk: ${risks[0].category} (${risks[0].severity}).` : "No high-risk patterns beyond PII/secrets.");

  return {
    documentId,
    entities,
    iocs,
    ttps,
    risks,
    keyFindings,
    summary,
    riskScore,
    classification,
    model: "heuristic-v1",
    evidence: evidence as any,
    counts: {
      entities: entities.length,
      iocs: iocs.length,
      ttps: ttps.length,
      risks: risks.length,
      keyFindings: keyFindings.length,
    },
  };
}
