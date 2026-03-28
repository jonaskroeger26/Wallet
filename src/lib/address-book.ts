const KEY = "wallet.addressBook.v1";

export type AddressBookEntry = { name: string; address: string };

export function loadAddressBook(): AddressBookEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AddressBookEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAddressBook(entries: AddressBookEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries));
}
