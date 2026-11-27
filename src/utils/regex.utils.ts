/**
 * Escapes special regular expression characters in untrusted user input to prevent ReDoS.
 */
export const escapeRegex = (input: string): string => {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
