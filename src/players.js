export const SEATS = ['host', 'guest', 'guest2', 'guest3', 'guest4'];
export const members = (meta = {}) => SEATS.map((seat) => meta?.[seat]).filter(Boolean);
export const capacity = (meta) => meta?.code?.startsWith('0') ? 2 : 5;
export const everyoneReady = (room) => members(room.meta).length >= 2 && members(room.meta).slice(1).every((uid) => room.ready?.[uid] > 0);
