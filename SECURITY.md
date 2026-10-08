# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, through GitHub's private
vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability**. Do not open a public issue, pull request or
discussion for a suspected vulnerability.

Please include:

- the version (`mcp-recorder --version`), your Node.js version and your OS;
- which part is affected (for example the stdio or HTTP proxy, gateway
  enforcement, the hook, redaction, the hash chain or signatures, `export`
  or `verify.cjs`, the evidence sink or the receiver);
- the steps to reproduce, with a minimal policy file or client config if
  one is involved;
- what you expected and what happened, and the impact as you understand it
  (for example a denied call that ran, a readable value in the store, or a
  bundle that verifies after it was altered).

Please do not include real credentials or real evidence stores; use
throwaway values.

We will acknowledge the report, keep you informed while we investigate,
and credit you in the release notes if you would like.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
| earlier | No |
