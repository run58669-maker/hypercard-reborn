// Description normalisation and hashing (design.md §3, §6.3).

/**
 * In this order: collapse every run of whitespace to one space, trim,
 * lower-case, remove one trailing full stop.
 */
export function normalise(description: string): string {
  let text = description.replace(/\s+/g, ' ')
  text = text.trim()
  text = text.toLowerCase()
  if (text.endsWith('.')) text = text.slice(0, -1)
  return text
}

/** hex(SHA-256(utf8(normalise(description)))). */
export async function descriptionHash(description: string): Promise<string> {
  const data = new TextEncoder().encode(normalise(description))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
