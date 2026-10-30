# Browser environment result

Recorded on 30 October 2026 on Windows. Playwright version 1.64.1 was used.

Chromium and WebKit completed the five local application scenarios. Hosted Chromium completed the same five scenarios using the public Vercel deployment. The JSON and HTML reports contain the actual durations and accessibility attachments.

Firefox 157.0 from Playwright revision 1555 failed before a browser page opened. Windows reported: “Dependent Assembly mozglue, language wildcard, type win32, version 1.0.0.0 could not be found.” The Windows error identified a side-by-side configuration failure. The DLL existed in the downloaded package. A forced fresh download produced the same startup error. An older cached Firefox binary also failed to start.

This is a host startup limit. It did not exercise the CampusFix application. Keep the Firefox project in the test configuration and rerun it on a working Windows or Linux host. The supplied CI definition installs all three browsers, but no remote CI result is claimed.
