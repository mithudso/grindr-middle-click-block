/**
 * Profile / cascade / views client.
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export function createProfiles(auth) {
  /** GET a single profile. */
  const getProfile = (id) => auth.request(`/api/v7/profiles/${auth.enc(id)}`);
  /** Record a profile view. */
  const recordView = (id) => auth.request(`/api/v4/views/${auth.enc(id)}`, { method: 'POST' });
  /**
   * Fetch a cascade page. `params` is serialized to a query string
   * (e.g. `{ pageNumber, nearbyGeoHash, sexualPositions }`).
   */
  const getCascade = (params = {}) => {
    const q = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return auth.request(`/api/v4/cascade/?${q}`);
  };
  return { getProfile, getCascade, recordView };
}
