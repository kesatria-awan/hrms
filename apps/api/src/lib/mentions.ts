/**
 * Parse @mentions from comment content.
 * Returns an array of user IDs that were mentioned.
 *
 * Format: @user_id (e.g., @user_123abc)
 */
export function parseMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = content.matchAll(mentionRegex);
  const userIds = new Set<string>();

  for (const match of matches) {
    userIds.add(match[1]);
  }

  return Array.from(userIds);
}
