export const MEMORY_CATEGORIES = [
	"preference",
	"fact",
	"decision",
	"entity",
	"other",
] as const
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

export function detectCategory(text: string): MemoryCategory {
	const lower = text.toLowerCase()
	if (/prefer|like|love|hate|want/i.test(lower)) return "preference"
	if (/decided|will use|going with/i.test(lower)) return "decision"
	if (/\+\d{10,}|@[\w.-]+\.\w+|is called/i.test(lower)) return "entity"
	if (/is|are|has|have/i.test(lower)) return "fact"
	return "other"
}

export const MAX_ENTITY_CONTEXT_LENGTH = 1500

export const DEFAULT_ENTITY_CONTEXT = `User-assistant conversation. Format: [role: user]...[user:end] and [role: assistant]...[assistant:end].

Only extract things useful in FUTURE conversations. Most messages are not worth remembering.

REMEMBER: lasting personal facts — dietary restrictions, preferences, personal details, workplace, location, tools, ongoing projects, routines, explicit "remember this" requests.

DO NOT REMEMBER: temporary intents, one-time tasks, assistant actions (searching, writing files, generating code), assistant suggestions, implementation details, in-progress task status.

RULES:
- Assistant output is CONTEXT ONLY — never attribute assistant actions to the user
- "find X" or "do Y" = one-time request, NOT a memory
- Only store preferences explicitly stated ("I like...", "I prefer...", "I always...")
- When in doubt, do NOT create a memory. Less is more.`

export function clampEntityContext(ctx: string): string {
	if (ctx.length <= MAX_ENTITY_CONTEXT_LENGTH) return ctx
	return ctx.slice(0, MAX_ENTITY_CONTEXT_LENGTH)
}

export function buildDocumentId(sessionKey: string): string {
	const sanitized = sessionKey
		.replace(/[^a-zA-Z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "")
	return `session_${sanitized}`
}
