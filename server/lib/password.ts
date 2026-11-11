import { randomInt } from "node:crypto";

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LOWERCASE + UPPERCASE + DIGITS;

const MIN_LENGTH = 12;

/**
 * Generate a temporary password that satisfies the Supabase password policy
 * (at least one lowercase letter, one uppercase letter and one digit).
 *
 * A purely random draw can miss one of those character classes, which makes
 * `auth.admin.updateUserById` fail with a password-policy error. This helper
 * guarantees every required class is present and then shuffles the result.
 */
export function generateTemporaryPassword(length = MIN_LENGTH): string {
  const size = Math.max(length, 3);
  const chars: string[] = [
    LOWERCASE[randomInt(LOWERCASE.length)],
    UPPERCASE[randomInt(UPPERCASE.length)],
    DIGITS[randomInt(DIGITS.length)],
  ];

  while (chars.length < size) {
    chars.push(ALL[randomInt(ALL.length)]);
  }

  // Fisher-Yates shuffle so the guaranteed characters are not in fixed slots.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
