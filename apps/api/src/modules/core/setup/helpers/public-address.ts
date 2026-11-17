import net from 'node:net';
import { ApiError } from '../../../../kernel/errors';

// The rules that stop the website reader being turned against our own network (docs/SECURITY.md, SSRF). Pure: no network.
// Ported from the hotel agent's fetchSite.js and written in full words.

/** Address ranges that are not the public internet: this machine, private and carrier networks, link-local (cloud metadata), documentation, benchmarking, multicast and reserved ranges. */
const BLOCKED_ADDRESS_RANGES = new net.BlockList();
for (const range of [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
]) {
  const [networkAddress, prefixLength] = range.split('/');
  BLOCKED_ADDRESS_RANGES.addSubnet(networkAddress!, Number(prefixLength), 'ipv4');
}
for (const range of [
  '::/127', // :: and ::1
  '64:ff9b::/96',
  '100::/64',
  '2001::/32',
  '2001:db8::/32',
  '2002::/16',
  'fc00::/7',
  'fe80::/10',
  'fec0::/10',
  'ff00::/8',
]) {
  const [networkAddress, prefixLength] = range.split('/');
  BLOCKED_ADDRESS_RANGES.addSubnet(networkAddress!, Number(prefixLength), 'ipv6');
}

/** Whether an IP address is on the public internet. An IPv4 address written as IPv6 (::ffff:10.0.0.1) is checked as IPv4. Anything that is not an IP address is not public. */
export function isPublicAddress(address: string): boolean {
  const ipAddress = address.replace(/^\[|\]$/g, '');
  const ipv4WrittenAsIpv6 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ipAddress);
  if (ipv4WrittenAsIpv6) return isPublicAddress(ipv4WrittenAsIpv6[1]!);
  const family = net.isIP(ipAddress);
  if (family === 0) return false;
  return !BLOCKED_ADDRESS_RANGES.check(ipAddress, family === 4 ? 'ipv4' : 'ipv6');
}

/** The refusal every "not a public website" case gives, so the answer never says which check failed. */
export const notAPublicWebsite = () =>
  new ApiError(400, 'WEBSITE_NOT_PUBLIC', "That address can't be read: it isn't a public website.");

/** The ports a website is read on: the standard web ports only. */
export const STANDARD_WEB_PORTS: readonly string[] = ['80', '443'];

/** What decides an address is allowed. Production uses the defaults; only tests loosen them, to reach a fake website on this machine. */
export interface WebsiteAddressRules {
  allowedPorts?: readonly string[];
  isAddressAllowed?: (address: string) => boolean;
}

/**
 * Turns what the owner typed into a web address we may fetch: "lakeside.in" becomes https://lakeside.in/. Refuses (400)
 * anything but http and https, a name and password in the address, a port other than `allowedPorts`, an IP address that is
 * not public, and names that cannot be public (no dot, `.local`, `.internal`...). The address actually connected to is checked
 * again when the page is fetched; this is the first line of defence.
 */
export function parseWebsiteAddress(typedAddress: unknown, rules: WebsiteAddressRules = {}): URL {
  const allowedPorts = rules.allowedPorts ?? STANDARD_WEB_PORTS;
  const isAddressAllowed = rules.isAddressAllowed ?? isPublicAddress;
  const text = String(typedAddress ?? '').trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new ApiError(400, 'WEBSITE_ADDRESS_INVALID', 'Enter the website address, like https://www.example.com');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new ApiError(400, 'WEBSITE_ADDRESS_INVALID', 'Only http and https websites can be read.');
  }
  if (url.username || url.password) {
    throw new ApiError(
      400,
      'WEBSITE_ADDRESS_INVALID',
      "That address can't be read: remove the name and password from it.",
    );
  }
  if (url.port && !allowedPorts.includes(url.port)) throw notAPublicWebsite();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const isIpAddress = net.isIP(hostname) !== 0;
  if (isIpAddress ? !isAddressAllowed(hostname) : !hostname.includes('.') || /\.(local|localhost|internal|lan|home)$/i.test(hostname)) {
    throw notAPublicWebsite();
  }
  url.hash = '';
  return url;
}
