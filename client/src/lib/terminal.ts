// client/src/lib/terminal.ts
//
// "This PC is a POS terminal" (2026-10-26). The PC keeps a long SECRET KEY given by
// the server when an owner / manager registered it. With that key the login page shows
// the PIN pad: the PC sends { key, PIN } and the server finds the restaurant FROM THE
// KEY, then the user with that PIN inside that restaurant.
// The key is kept in this browser (RES POS window) only. Removing the terminal on
// Settings → Users makes the key useless at once.

const KEY = 'pos_terminal_key';
const NAME = 'pos_terminal_restaurant';

export const terminalKey = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const terminalRestaurant = (): string => {
  try {
    return localStorage.getItem(NAME) || '';
  } catch {
    return '';
  }
};

export function saveTerminal(key: string, restaurantName: string) {
  try {
    localStorage.setItem(KEY, key);
    localStorage.setItem(NAME, restaurantName);
  } catch {
    /* storage blocked: the PC stays a normal email login */
  }
}

export function forgetTerminal() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(NAME);
  } catch {
    /* ignore */
  }
}
