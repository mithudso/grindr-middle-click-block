// Private-album share client. A 403 on an album op means the album is not yours
// (deleted/invalid) — the caller should retire it rather than retry.

function uuid4() {
  try { if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID(); } catch (_e) {}
  const b = new Array(16);
  for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

/**
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export function createAlbums(auth) {
  /** @returns {Promise<string[]>} profile ids that already hold the album */
  const getShares = async (albumId) => {
    const d = await auth.request(`/api/v1/albums/${auth.enc(albumId)}/shares`);
    return Array.isArray(d && d.profileIds) ? d.profileIds : [];
  };
  /** Share an album with a profile. */
  const share = (albumId, profileId, shareId = uuid4()) =>
    auth.request(`/api/v1/albums/${auth.enc(albumId)}/shares`, { method: 'POST', body: { profiles: [{ profileId: String(profileId), shareId }] } });
  /** Revoke a share (PUT unshares, fresh uuid). */
  const unshare = (albumId, profileId, shareId = uuid4()) =>
    auth.request(`/api/v1/albums/${auth.enc(albumId)}/unshares`, { method: 'PUT', body: { profiles: [{ profileId: String(profileId), shareId }] } });
  /** Query whether a profile has/was-shared an album (a query despite the POST). */
  const queryShare = (profileId) =>
    auth.request('/api/v2/albums/shares', { method: 'POST', body: { profileId: String(profileId) } });
  return { getShares, share, unshare, queryShare };
}
