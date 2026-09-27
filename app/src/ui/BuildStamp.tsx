/**
 * The build's short git commit, injected by CI (lib/build.ts). A one-line
 * footer stamp so a running install can be told apart from a stale one.
 */
import { appVersion } from '../lib/build';
import { Txt } from './kit';

export function BuildStamp() {
  return (
    <Txt variant="small" style={{ textAlign: 'center', paddingTop: 12, paddingBottom: 4 }}>
      Build {appVersion()}
    </Txt>
  );
}
