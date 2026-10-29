#!/bin/sh
# Build, sign with the "projector" Samsung profile, install and launch on the projector.
# Usage: ./deploy.sh            (TV_IP defaults to 10.0.0.61)
set -eu
cd "$(dirname "$0")"
TV_IP="${TV_IP:-10.0.0.61}"
export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"

npm run build >/dev/null
STAGE="$(mktemp -d)"
mkdir -p "$STAGE/Arn0"
(cd "$STAGE/Arn0" && unzip -q "$OLDPWD/dist/arn0-launcher.wgt")
tizen package -t wgt -s projector -o "$STAGE/out" -- "$STAGE/Arn0" >/dev/null
mv "$STAGE/out/"*.wgt "$STAGE/out/Arn0Launcher.wgt"

sdb connect "$TV_IP:26101" >/dev/null
(cd "$STAGE/out" && tizen install -n Arn0Launcher.wgt -s "$TV_IP:26101")
tizen run -p Arn0Lnchr0.Launcher -s "$TV_IP:26101"
rm -rf "$STAGE"
