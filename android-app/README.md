# Tennis Value Scanner — Production APK

This Android wrapper packages the **Production** web application from the repository root. It does not include the Developer edition or model laboratory.

- App ID: `com.tennisvaluescanner.production`
- Version: `2.0.1` (version code `201`)
- Minimum Android: 7.0 (API 24)
- Web UI and assets are bundled into the APK.
- Live match data and odds continue to come from the existing Cloudflare Worker API; an internet connection is required for live data.
- The APK is built by GitHub Actions and uploaded as the `TVS-Production-v2.0.1-APK` workflow artifact.
- Current CI artifact uses the Android debug signing key for direct installation/testing. It is not a Play Store release signing key.
