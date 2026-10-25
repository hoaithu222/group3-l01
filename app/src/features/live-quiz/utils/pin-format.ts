/** Mã PIN chia nhóm 3 số (`123456` → `['123', '456']`) — mắt đọc và đọc to cho người bên cạnh dễ hơn một dãy 6 số liền. */
export function pinGroups(pin: string): string[] {
  const groups: string[] = [];
  for (let start = 0; start < pin.length; start += 3) groups.push(pin.slice(start, start + 3));
  return groups;
}
