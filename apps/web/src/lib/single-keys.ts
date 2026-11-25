/** The parts of a key press that decide whether it is a single-key shortcut. */
export type KeyPress = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/**
 * A shortcut made of one character key (WCAG 2.1.4): a letter, digit, punctuation or symbol without
 * Strg, ⌘ or Alt (Shift is part of the character: "?" is Shift+ß). Space, Enter, Esc and the arrows
 * are not character keys; Strg+K and Strg+Z have a modifier. These are the keys people can turn off
 * ("Tastenkürzel mit einzelnen Tasten", UX-054).
 */
export function isSingleCharacterKey(event: KeyPress): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  // `key` is the produced character for character keys ("j", "?", "ß") and a name for the others.
  return [...event.key].length === 1 && event.key.trim() !== "";
}

/**
 * Where a character key is not a shortcut but input or a widget's own typeahead: text fields, and
 * menus, list boxes and similar widgets that jump to the item starting with that letter.
 */
export const OWN_KEYS =
  "input, textarea, select, [contenteditable], [role=menu], [role=menubar], [role=listbox], [role=combobox], [role=tree]";
