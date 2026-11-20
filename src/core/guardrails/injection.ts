/**
 * Prompt-injection screening. Used twice: at ingestion (scraped blocks that
 * look like instructions to a model are quarantined and never indexed) and at
 * runtime (user turns and any context sent to a generative provider).
 */
const PATTERNS: { id: string; re: RegExp }[] = [
  { id: "ignore-instructions", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|all|earlier|system)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|messages?)\b/i },
  { id: "role-reassign", re: /\byou are (now|no longer)\b|\bact as (an? )?(unrestricted|jailbroken|dan|developer mode)\b|\bfrom now on,? you\b/i },
  { id: "system-prompt-probe", re: /\b(reveal|print|show|repeat|leak|output)\b[^.\n]{0,30}\b(system|hidden|initial|developer)\s+(prompt|instructions?|message)\b/i },
  { id: "chat-template-token", re: /<\|(im_start|im_end|system|user|assistant|endoftext|eot_id|start_header_id)\|>|\[\/?INST\]|<<\/?SYS>>/i },
  { id: "role-prefix", re: /(^|\n)\s*(system|assistant|developer)\s*:\s*\S/i },
  { id: "markdown-exfil", re: /!\[[^\]]*\]\(https?:\/\/[^)]*\?(?:[^)]*=)\S*\)/i },
  { id: "tool-call", re: /\b(call|invoke|execute|run)\s+(the\s+)?(tool|function|command|shell)\b/i },
  { id: "ar-ignore-instructions", re: /(تجاهل|انس|أهمل|اهمل)\s+(كل\s+|جميع\s+)?(التعليمات|الأوامر|الاوامر|القواعد)/ },
  { id: "ar-role-reassign", re: /أنت\s+الآن|انت\s+الان|تصرف\s+ك/ },
];

export interface InjectionVerdict {
  flagged: boolean;
  hits: string[];
}

export function detectInjection(text: string): InjectionVerdict {
  const hits = PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
  return { flagged: hits.length > 0, hits };
}

/** Neutralise content before it is placed inside a model prompt as untrusted data. */
export function sanitizeForPrompt(text: string): string {
  return text
    .replace(/<\|[^|>]{1,40}\|>/g, " ")
    .replace(/\[\/?INST\]|<<\/?SYS>>/gi, " ")
    .replace(/(^|\n)\s*(system|assistant|developer|user)\s*:/gi, "$1")
    .replace(/<\/?source[^>]*>/gi, " ")
    .replace(/```/g, "'''");
}
