import type { ChatMessage, OutcomeSignal } from './types';

/** Flattens OpenAI message content (string or parts) to plain text. */
export function messageText(message: ChatMessage | undefined): string {
  if (!message || message.content == null) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map(part => (typeof part.text === 'string' ? part.text : '')).join('\n');
}

const FAIL_MARKERS = [
  /^not ok \d+/m,
  /# fail [1-9]/,
  /\b[1-9]\d* (?:failed|failing)\b/i,
  /AssertionError/,
  /Traceback \(most recent call last\)/,
  /^FAIL\b/m,
  /✖/,
  /exit code:? [1-9]/i,
  /panicked at/,
  /error\[E\d{4}\]/,
  /SyntaxError|ReferenceError|TypeError/,
];

const PASS_MARKERS = [/# fail 0\b/, /\ball tests? passed\b/i, /\b0 failed\b/i, /test result: ok\./, /exit code:? 0\b/i];

/**
 * Reads the newest tool or user message after the last assistant turn and
 * decides whether it reports a passing or failing check. This is the signal
 * Cascade routes on: the observed outcome of the previous answer, not a guess
 * about how hard the prompt looks.
 */
export function detectOutcome(messages: ChatMessage[]): OutcomeSignal {
  let lastAssistant = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAssistant = i;
      break;
    }
  }
  if (lastAssistant === -1) return { outcome: 'unknown', signature: '' };
  const feedback = messages
    .slice(lastAssistant + 1)
    .filter(m => m.role === 'tool' || m.role === 'user')
    .map(messageText)
    .join('\n');
  if (!feedback.trim()) return { outcome: 'unknown', signature: '' };

  const passed = numberAfter(feedback, /# pass (\d+)/) ?? numberAfter(feedback, /\b(\d+) passed\b/i);
  const failed = numberAfter(feedback, /# fail (\d+)/) ?? numberAfter(feedback, /\b(\d+) (?:failed|failing)\b/i);

  const failing = FAIL_MARKERS.some(rx => rx.test(feedback)) && failed !== 0;
  const passing = !failing && PASS_MARKERS.some(rx => rx.test(feedback));
  const outcome = failing ? 'fail' : passing ? 'pass' : 'unknown';
  return { outcome, passed, failed, signature: outcome === 'fail' ? failureSignature(feedback) : '' };
}

function numberAfter(text: string, rx: RegExp): number | undefined {
  const match = rx.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** The first few lines that name what failed, without paths, positions or values that change every run. */
export function failureSignature(feedback: string): string {
  const interesting = feedback
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^not ok|Error|error\[|FAIL|✖|expected|actual|assert/i.test(line))
    .slice(0, 6)
    .join(' | ');
  return (interesting || feedback.slice(0, 300))
    .replace(/\/[\w./-]+\//g, '<PATH>/')
    .replace(/:\d+:\d+/g, ':<L>')
    .replace(/\b\d+(?:\.\d+)?ms\b/g, '<T>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.8);
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(messageText(m)) + 4, 0);
}
