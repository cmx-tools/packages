export function verifyRelease(
  _pluginConfig,
  { cwd, lastRelease, nextRelease },
) {
  if (nextRelease.version.startsWith("0.")) {
    return;
  }

  const guidance = lastRelease.version
    ? "A stable release requires an explicit change to the release policy."
    : "Publish the initial 0.1.0 version and tag that actual release before retrying.";

  throw new Error(
    `Refusing automatic ${nextRelease.version} release for ${cwd}. CMX releases must stay on 0.x. ${guidance}`,
  );
}
