/**
 * Android native config the generated project needs (CNG: android/ is never
 * edited by hand):
 * - release signing from the CI keystore env vars — every published APK must
 *   be signed with this key, or existing installs can never update;
 * - network security: release builds are HTTPS-only; debug builds permit
 *   cleartext (Metro, the plain-HTTP local demo). The JS layer additionally
 *   gates http:// joins on the debuggable flag (lib/build.ts).
 */
const fs = require('node:fs');
const path = require('node:path');
const { withAppBuildGradle, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (System.getenv("KERYX_KEYSTORE_PATH")) {
                storeFile file(System.getenv("KERYX_KEYSTORE_PATH"))
                storePassword System.getenv("KERYX_KEYSTORE_PASSWORD")
                keyAlias System.getenv("KERYX_KEY_ALIAS")
                keyPassword System.getenv("KERYX_KEY_PASSWORD")
                storeType "pkcs12"
            }
        }`;

function networkConfig(cleartext) {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="${cleartext}" />
</network-security-config>
`;
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes('KERYX_KEYSTORE_PATH')) return config;
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_SIGNING}`);
    // without the CI keystore a local release build falls back to the debug
    // key so it stays installable; CI refuses to publish without the keystore
    gradle = gradle.replace(
      /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig System.getenv("KERYX_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug',
    );
    if (!gradle.includes('signingConfigs.release : signingConfigs.debug')) {
      throw new Error('with-keryx-android: could not patch the release signingConfig');
    }
    config.modResults.contents = gradle;
    return config;
  });
}

function withNetworkSecurity(config) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return config;
  });
  return withDangerousMod(config, [
    'android',
    (config) => {
      const src = path.join(config.modRequest.platformProjectRoot, 'app', 'src');
      for (const [variant, cleartext] of [['main', false], ['debug', true], ['debugOptimized', true]]) {
        const dir = path.join(src, variant, 'res', 'xml');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'network_security_config.xml'), networkConfig(cleartext));
      }
      return config;
    },
  ]);
}

module.exports = (config) => withNetworkSecurity(withReleaseSigning(config));
