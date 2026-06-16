import { HttpsProxyAgent } from "https-proxy-agent";

export function createProxyAgent(customConfig = {}) {
  const username = "spb6ythjdg";
  const password = "i0UYO3ge2so7j+qggF";
  const host = "isp.decodo.com";
  const port = "10001";

  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);

  const proxyUrl = `http://${encodedUser}:${encodedPass}@${host}:${port}`;

  return new HttpsProxyAgent(proxyUrl);
}

export default createProxyAgent;
